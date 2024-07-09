import { Client, GatewayIntentBits, Message, Events, SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import dotenv from "dotenv";
import { BOT_NAME, MODEL_NAME, PRE_PROMPT, SAFETY_SETTINGS, ALLOWED_IMAGE_TYPES, DEFAULT_CONTEXT_SIZE } from "./config";
import { fetch } from 'undici';

dotenv.config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

// Context
const contextMap = new Map<string, { size: number, messages: { role: string, parts: { text: string }[] }[] }>();

function getContext(channelId: string): { size: number, messages: { role: string, parts: { text: string }[] }[] } {
    if (!contextMap.has(channelId)) {
        contextMap.set(channelId, { size: DEFAULT_CONTEXT_SIZE, messages: [] });
    }
    return contextMap.get(channelId)!;
}

function addToContext(channelId: string, role: 'user' | 'model', message: string) {
    const context = getContext(channelId);
    context.messages.push({ role, parts: [{ text: message }] });
    if (context.messages.length > context.size) {
        context.messages.shift();
    }
}

client.once(Events.ClientReady, async (c) => {
    console.log(`Logged in as ${c.user.tag}`);

    const commands = [
        new SlashCommandBuilder().setName('view-context').setDescription('Display the current context'),
        new SlashCommandBuilder().setName('set-context').setDescription('Set the number of messages in context')
            .addIntegerOption(option => option.setName('size').setDescription('Number of messages to keep in context').setRequired(true)),
        new SlashCommandBuilder().setName('clear-context').setDescription('Clear the current context'),
    ];

    await client.application?.commands.set(commands);
});

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    switch (commandName) {
        case 'view-context':
            await handleViewContext(interaction);
            break;
        case 'set-context':
            await handleSetContext(interaction);
            break;
        case 'clear-context':
            await handleClearContext(interaction);
            break;
    }
});

async function handleViewContext(interaction: ChatInputCommandInteraction) {
    const context = getContext(interaction.channelId);
    const embed = new EmbedBuilder()
        .setTitle('Current Context')
        .setDescription(context.messages.map(msg => `${msg.role}: ${msg.parts[0].text}`).join('\n') || 'No messages in context')
        .addFields(
            { name: 'Current context size', value: context.messages.length.toString(), inline: true },
            { name: 'Max context size', value: context.size.toString(), inline: true }
        );
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleSetContext(interaction: ChatInputCommandInteraction) {
    const newSize = interaction.options.getInteger('size', true);
    if (newSize < 0) {
        await interaction.reply({ content: 'Context size must be 0 or greater.', ephemeral: true });
        return;
    }

    const context = getContext(interaction.channelId);
    context.size = newSize;
    context.messages = context.messages.slice(-newSize);

    await interaction.reply({ content: `Context size set to ${newSize}.`, ephemeral: true });
}

async function handleClearContext(interaction: ChatInputCommandInteraction) {
    const context = getContext(interaction.channelId);
    context.messages = [];
    await interaction.reply({ content: 'Context cleared.', ephemeral: true });
}

client.on(Events.MessageCreate, async (message: Message) => {
    if (message.author.bot) return;

    const botMentioned = message.mentions.has(client.user!);
    const shouldRespond = botMentioned || 
                          message.content.toLowerCase().includes(BOT_NAME.toLowerCase()) || 
                          (message.reference?.messageId && (await message.channel.messages.fetch(message.reference.messageId)).author.id === client.user?.id);

    if (shouldRespond) {
        const context = getContext(message.channelId);
        let imageContent: Uint8Array | null = null;
        let attachment = null;
        if (message.attachments.size > 0) {
            attachment = message.attachments.first();
            if (attachment && ALLOWED_IMAGE_TYPES.includes(attachment.contentType || '')) {
                const response = await fetch(attachment.url);
                const arrayBuffer = await response.arrayBuffer();
                imageContent = new Uint8Array(arrayBuffer);
                addToContext(message.channelId, 'user', 'User sent an image');
            }
        }

        const userMessage = message.content;
        addToContext(message.channelId, 'user', userMessage);

        const contextMessages = context.messages.map(msg => `${msg.role}: ${msg.parts[0].text}`).join('\n');
        const prompt = `${PRE_PROMPT}\n\n${contextMessages}\n\nmodel:`;

        try {
            const model = genAI.getGenerativeModel({
                model: MODEL_NAME,
                safetySettings: SAFETY_SETTINGS.map(setting => ({
                    category: HarmCategory[setting.category as keyof typeof HarmCategory],
                    threshold: HarmBlockThreshold[setting.threshold as keyof typeof HarmBlockThreshold],
                })),
            });

            let result;
            if (imageContent && attachment) {
                const parts = [
                    { text: prompt },
                    { inlineData: { mimeType: attachment.contentType || '', data: Buffer.from(imageContent).toString('base64') } }
                ];
                result = await model.generateContent(parts);
            } else {
                result = await model.generateContent(prompt);
            }

            const response = result.response;
            const text = response.text().trim();

            addToContext(message.channelId, 'model', text);

            if (text.length > 2000) {
                const chunks = text.match(/.{1,2000}/g) || [];
                for (const chunk of chunks) {
                    await message.reply(chunk);
                }
            } else {
                await message.reply(text);
            }
        } catch (error) {
            console.error("Error generating response:", error);
            if (error instanceof Error && error.message.includes("Candidate was blocked due to SAFETY")) {
                await message.reply("I'm sorry, but I couldn't generate a response due to safety concerns. Let's try a different topic!");
            } else if (error instanceof Error && error.message.includes("Too Many Requests")) {
                await message.reply("I'm currently receiving too many requests. Please try again later.");
            } else {
                await message.reply("An error occurred while processing your request. Please try again later.");
            }
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
