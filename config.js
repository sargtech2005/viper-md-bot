/**
 * ╔═══════════════════════════════════════╗
 * ║     ᴠɪᴘᴇʀ ʙᴏᴛ ᴍᴅ — ᴄᴏɴꜰɪɢ           ║
 * ║  Owner: Sarg-Tech & Viper             ║
 * ╚═══════════════════════════════════════╝
 */

module.exports = {
    ownerNumber: ['2348083086811', '2349041088690'],
    ownerName:   ['Sarg-Tech', 'Viper'],
    ownerGithub: ['remzytech001', 'sargtech1'],
    ownerChatId: '6952558480',

    botName:     'VIPER BOT MD',
    prefix:      '.',
    sessionName: 'session',
    sessionID:   process.env.SESSION_ID || '',
    botVersion:  '2.7',

    newsletterJid: '120363422481725473@newsletter',
    updateZipUrl:  'https://github.com/remzytech001/viperbotmd/archive/refs/heads/main.zip',

    packname:   'VIPER BOT MD',
    packauthor: 'Sarg-Tech',

    selfMode:      false,
    autoRead:      false,
    autoTyping:    false,
    autoBio:       false,
    autoSticker:   false,
    autoReact:     false,
    autoReactMode: 'bot',
    autoDownload:  false,

    telegramBotToken: process.env.TG_BOT_TOKEN || '',
    telegramOwnerId:  process.env.TG_OWNER_ID  || '6952558480',

    defaultGroupSettings: {
        antilink:              false,
        antilinkAction:        'delete',
        antitag:               false,
        antitagAction:         'delete',
        antiall:               false,
        antiviewonce:          false,
        antibot:               false,
        anticall:              false,
        antigroupmention:      false,
        antigroupmentionAction:'delete',
        welcome:               false,
        welcomeMessage: '╭╼━≪•ɴᴇᴡ ᴍᴇᴍʙᴇʀ•≫━╾╮\n┃ᴡᴇʟᴄᴏᴍᴇ: @user 👋\n┃ᴍᴇᴍʙᴇʀ: #memberCount\n┃ᴛɪᴍᴇ: time ⏰\n╰━━━━━━━━━━━━━━━╯\n\n*@user* Welcome to *@group*! 🎉\n> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ VIPER BOT MD*',
        goodbye:               false,
        goodbyeMessage:        "👋 @user just left. Don't let the door hit you 😂",
        antiSpam:              false,
        antidelete:            false,
        nsfw:                  false,
        detect:                false,
        chatbot:               false,
        autosticker:           false,
    },

    apiKeys: { openai: '', deepai: '', remove_bg: '' },

    messages: {
        wait:           '⏳ ᴄʜɪʟʟ... ᴅᴏɪɴɢ ᴛʜᴇ ᴛʜɪɴɢ... 🔄',
        success:        '✅ ᴅᴏɴᴇ! ᴇᴀꜱʏ ᴡᴏʀᴋ 😎',
        error:          '❌ ꜱᴏᴍᴇᴛʜɪɴɢ ʙʟᴇᴡ ᴜᴘ 💀 Try again!',
        ownerOnly:      '*📛 ᴛʜɪꜱ ɪꜱ ᴀɴ ᴏᴡɴᴇʀ ᴄᴏᴍᴍᴀɴᴅ.*\n\n😆 Your boldness is appreciated but this is strictly owner territory. Nice try though 💀',
        adminOnly:      '*🛡️ ᴀᴅᴍɪɴꜱ ᴏɴʟʏ!*\n\n😂 Go get a promotion first before coming here with that energy 💀',
        groupOnly:      '*👥 ɢʀᴏᴜᴘ-ᴏɴʟʏ ᴄᴍᴅ!*\n\n😅 What are you doing in DMs bestie? Join a group first 🤦',
        privateOnly:    '*💬 ᴅᴍꜱ ᴏɴʟʏ!*\n\n😏 Slide into my DMs for this one. Not here in public 😂',
        botAdminNeeded: '*🤖 ɪ ɴᴇᴇᴅ ᴀᴅᴍɪɴ!*\n\n😤 Make me admin first! I don\'t do free labour 💀',
        invalidCommand: '❓ ɴᴏᴛ ᴀ ᴄᴏᴍᴍᴀɴᴅ ʙᴇꜱᴛɪᴇ 😅 Try *.menu* to see what I can actually do 🐍',
    },

    timezone:    'Africa/Lagos',
    maxWarnings: 3,

    social: {
        github:   'https://github.com/remzytech001',
        github2:  'https://github.com/sargtech1',
        channel:  'https://whatsapp.com/channel/0029VbCbMBtAe5VuprvXah23',
    },
};
