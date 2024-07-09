# Gemini Discord Bot

A Discord bot that uses Google's Generative AI, capable of engaging in conversations and processing images.

## Features

- Responds to mentions, direct messages, and when its name is used
- Maintains conversation context for each channel
- Processes and responds to images
- Slash commands for managing context:
  - Set context size
  - View current context
  - Clear context

## Setup

1. Clone the repository

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file with your Discord token and Google API key:
   ```
   DISCORD_TOKEN=your_discord_token_here
   GOOGLE_API_KEY=your_google_api_key_here
   ```

   - To create a Discord bot and get your token, visit:
     [Discord Developer Portal](https://discord.com/developers/applications)
   
   - To obtain your Google API key for Gemini, go to:
     [Google AI Studio](https://makersuite.google.com/app/apikey)

4. Configure the bot in `config.ts`:
   - Set `BOT_NAME` to your desired bot name
   - Choose the `MODEL_NAME` for the Google Generative AI model 
   - Adjust `SAFETY_SETTINGS` to your preferred thresholds
     (For more information, see [Gemini API Safety Settings](https://ai.google.dev/docs/safety_setting_gemini))
   - Modify `ALLOWED_IMAGE_TYPES` if needed

5. Run the bot:
   ```
   npm start
   ```

## Usage

- Mention the bot or use its name to start a conversation
- Send images for the bot to analyze and respond to
- Use slash commands to manage conversation context:
  - `/view-context`: Display the current context
  - `/set-context`: Set the number of messages to keep in context
  - `/clear-context`: Clear the current context

## Dependencies

- discord.js
- @google/generative-ai
- dotenv
- undici
