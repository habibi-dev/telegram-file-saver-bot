# Telegram File Saver Bot

![Screenshot](src/assets/cover.jpg)

A Telegram bot built with Node.js that securely receives and stores files from a specific user. The bot filters files
based on allowed file extensions, downloads them, and saves them to a server. It includes features such as:

- Configurable file extension filters and storage paths through environment variables.
- Supports multiple file types including documents, audio, video, and photos.

This project is ideal for securely managing file uploads through Telegram with efficient storage handling.

## Installation

- Clone this repository:
  ```bash
  git clone https://github.com/habibi-dev/telegram-file-saver-bot.git
  cd telegram-file-saver-bot
  ```
- Install the required dependencies:
  ```bash
  npm install
  ```
- Copy the .env.example file to .env and update the environment variables:
  ```bash
  cp .env.example .env
  ```
    - In the .env file, set the value of DIR to the absolute path of the directory containing your .mp3 files. Make sure
      this folder only contains .mp3 files.
- Run the bot:
  ```bash 
  npm start
  ```

## Usage:

- Clone the repository and install dependencies.
- Set up the environment variables (YOUR_BOT_TOKEN, YOUR_USERNAME, ALLOWED_EXTENSIONS, SAVE_PATH).
- Run the project using npm start or node dist/index.js.
- Send your desired file to the bot (which you received a token for) and it will automatically be saved on the server.

## Environment Variables

- ```YOUR_BOT_TOKEN:``` Your YOUR_BOT_TOKEN in Bot.
- ```YOUR_USERNAME:``` Your Username.
- ```ALLOWED_EXTENSIONS:``` Ex: mp3,wav,mp4
- ```SAVE_PATH:``` Target sAVE file

