const fs = require('fs').promises;
const login = require("facebook-chat-api");

let commands;
const adminMode = {};
const adminCommands = ['kick', 'ban', 'unban', 'mute', 'unmute'];

async function loadCommands() {
    try {
        const data = await fs.readFile('./data/commands.json', 'utf8');
        commands = JSON.parse(data);
    } catch (err) {
        console.error("Lỗi khi đọc file commands.json:", err);
        process.exit(1);
    }
}

async function startBot() {
    try {
        await loadCommands();
        const appState = JSON.parse(await fs.readFile('./data/appstate.json', 'utf8'));
        const api = await new Promise((resolve, reject) => {
            login({appState}, (err, api) => {
                if(err) reject(err);
                else resolve(api);
            });
        });
        
        api.setOptions({listenEvents: true});
        api.listenMqtt(handleMessage.bind(null, api));
    } catch (err) {
        console.error("Lỗi khi khởi động bot:", err);
        process.exit(1);
    }
}

async function handleMessage(api, err, message) {
    if(err) return console.error("Lỗi khi lắng nghe tin nhắn:", err);

    if (message.type !== 'message' || !message.body) return;

    const fullBody = message.body.trim();
    const commandArgs = fullBody.split(' ');
    const command = commandArgs[0].toLowerCase();

    let taggedUser = null;
    let contentAfterTag = '';

    if (message.mentions && Object.keys(message.mentions).length > 0) {
        const [mentionedUserId, mentionedName] = Object.entries(message.mentions)[0];
        taggedUser = { id: mentionedUserId, tag: mentionedName };
        const tagIndex = fullBody.indexOf(mentionedName);
        if (tagIndex !== -1) {
            contentAfterTag = fullBody.substring(tagIndex + mentionedName.length).trim();
        }
    }

    if (adminMode[message.threadID] && adminCommands.includes(command)) {
        const isUserAdmin = await isAdmin(api, message.senderID, message.threadID);
        if (!isUserAdmin) {
            api.sendMessage(commands.admin_only.response, message.threadID);
            return;
        }
    }

    handleCommand(api, message, command, commandArgs, taggedUser, contentAfterTag);
}

function handleCommand(api, message, command, commandArgs, taggedUser, contentAfterTag) {
    const commandHandlers = {
        'hello': () => api.sendMessage(commands.hello.response, message.threadID),
        'help': () => handleHelpCommand(api, message),
        'time': () => sendCurrentTime(api, message.threadID),
        '.admin': () => handleAdminCommand(api, message),
        'kick': () => handleKickCommand(api, message, taggedUser),
        'ban': () => handleBanCommand(api, message, taggedUser),
        'unban': () => handleUnbanCommand(api, message, commandArgs[1]),
        'mute': () => handleMuteCommand(api, message, taggedUser),
        'unmute': () => handleUnmuteCommand(api, message, taggedUser),
        'setbd': () => handleSetBdCommand(api, message, taggedUser, contentAfterTag),
        '.ping': () => handlePingCommand(api, message, contentAfterTag)
    };

    const handler = commandHandlers[command];
    if (handler) {
        handler();
    } else {
        api.sendMessage("Lệnh không hợp lệ. Gõ 'help' để xem danh sách lệnh.", message.threadID);
    }
}

function handleHelpCommand(api, message) {
    let helpMessage = commands.help.response + "\n\n";
    
    for (const [command, info] of Object.entries(commands)) {
        if (info.description) {
            helpMessage += `- ${command}: ${info.description}\n`;
            if (info.usage) {
                helpMessage += `  Cách sử dụng: ${info.usage}\n`;
            }
            if (info.admin_only) {
                helpMessage += "  (Chỉ dành cho admin)\n";
            }
            helpMessage += "\n";
        }
    }

    api.sendMessage(helpMessage, message.threadID);
}

function sendCurrentTime(api, threadID) {
    const currentTime = new Date().toLocaleString('vi-VN');
    api.sendMessage(commands.time.response + currentTime, threadID);
}

function handleAdminCommand(api, message) {
    adminMode[message.threadID] = !adminMode[message.threadID];
    const status = adminMode[message.threadID] ? "bật" : "tắt";
    const response = commands['.admin'].response.replace("{status}", status);
    api.sendMessage(response, message.threadID);
}

function handleKickCommand(api, message, taggedUser) {
    if (!taggedUser) {
        api.sendMessage("Vui lòng tag người cần kick.", message.threadID);
        return;
    }

    api.removeUserFromGroup(taggedUser.id, message.threadID, (err) => {
        if (err) {
            console.error("Lỗi khi kick người dùng:", err);
            api.sendMessage(`Không thể kick người dùng. Lỗi: ${err.error || err.message || JSON.stringify(err)}`, message.threadID);
        } else {
            const response = commands.kick.response.replace("{user}", taggedUser.tag);
            api.sendMessage(response, message.threadID);
        }
    });
}

function handleSetBdCommand(api, message, taggedUser, newNickname) {
    if (!taggedUser || !newNickname) {
        api.sendMessage(commands.setbd.usage, message.threadID);
        return;
    }

    api.changeNickname(newNickname, message.threadID, taggedUser.id, (err) => {
        if (err) {
            console.error("Lỗi khi đổi biệt danh:", err);
            api.sendMessage(`Lỗi khi đổi biệt danh: ${err.error || err.message || JSON.stringify(err)}`, message.threadID);
        } else {
            const response = commands.setbd.response
                .replace("{user}", taggedUser.tag)
                .replace("{nickname}", newNickname);
            api.sendMessage(response, message.threadID);
        }
    });
}

async function handlePingCommand(api, message, contentAfterCommand) {
    if (!contentAfterCommand) {
        api.sendMessage(commands['.ping'].usage, message.threadID);
        return;
    }

    try {
        const threadInfo = await new Promise((resolve, reject) => {
            api.getThreadInfo(message.threadID, (err, info) => {
                if (err) reject(err);
                else resolve(info);
            });
        });

        const participantIDs = threadInfo.participantIDs;
        let mentions = [];

        for (let i = 0; i < participantIDs.length; i++) {
            if (participantIDs[i] !== api.getCurrentUserID()) {
                mentions.push({
                    tag: '\u200B',
                    id: participantIDs[i],
                    fromIndex: i,
                });
            }
        }

        const pingMessage = '\u200B'.repeat(mentions.length) + contentAfterCommand;

        api.sendMessage({
            body: pingMessage,
            mentions: mentions
        }, message.threadID);

    } catch (err) {
        console.error("Lỗi khi thực hiện lệnh ping:", err);
        api.sendMessage("Có lỗi xảy ra khi thực hiện lệnh ping.", message.threadID);
    }
}

async function isAdmin(api, userID, threadID) {
    return new Promise((resolve, reject) => {
        api.getThreadInfo(threadID, (err, info) => {
            if (err) {
                reject(err);
            } else {
                resolve(info.adminIDs.some(admin => admin.id === userID));
            }
        });
    });
}

// Khởi động bot
startBot();