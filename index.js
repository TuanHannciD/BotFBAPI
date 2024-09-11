const login = require("facebook-chat-api");
const fs = require("fs");

const appstate = JSON.parse(fs.readFileSync('./data/appstate.json', 'utf8'));
const commands = JSON.parse(fs.readFileSync('./data/commands.json', 'utf8'));

const adminMode = {};
const groupAdmins = {};
const adminCommands = ['kick', 'ban', 'unban', 'mute', 'unmute'];

async function getGroupAdmins(api, threadID) {
    try {
        const info = await new Promise((resolve, reject) => {
            api.getThreadInfo(threadID, (err, info) => {
                if (err) reject(err);
                else resolve(info);
            });
        });
        return info.adminIDs.map(admin => admin.id);
    } catch (err) {
        console.error("Lỗi khi lấy danh sách admin:", err);
        return [];
    }
}

async function isAdmin(api, userId, threadID) {
    if (!groupAdmins[threadID]) {
        groupAdmins[threadID] = await getGroupAdmins(api, threadID);
    }
    return groupAdmins[threadID].includes(userId);
}

function handleCommand(api, message, command, commandArgs, taggedUser, contentAfterTag) {
    switch(command) {
        case '.admin':
            handleAdminCommand(api, message);
            break;
        case 'hello':
            api.sendMessage(commands.hello, message.threadID);
            break;
        case 'help':
            handleHelpCommand(api, message);
            break;
        case 'time':
            sendCurrentTime(api, message.threadID);
            break;
        case 'kick':
            handleKickCommand(api, message, taggedUser);
            break;
        case 'ban':
            handleBanCommand(api, message, commandArgs);
            break;
        case 'unban':
            handleUnbanCommand(api, message, commandArgs);
            break;
        case 'mute':
            handleMuteCommand(api, message, commandArgs);
            break;
        case 'unmute':
            handleUnmuteCommand(api, message, commandArgs);
            break;
        case 'setbd':
            if (taggedUser && contentAfterTag) {
                handleSetBdCommand(api, message, taggedUser, contentAfterTag);
            } else {
                api.sendMessage("Vui lòng tag người dùng và nhập biệt danh mới.", message.threadID);
            }
            break;
        case 'changecolor':
            handleChangeColorCommand(api, message);
            break;
        case '.ping':
            const contentAfterCommand = message.body.substring(message.body.indexOf('.ping') + 5).trim();
            handlePingCommand(api, message, contentAfterCommand);
            break;
    }
}

async function handleAdminCommand(api, message) {
    adminMode[message.threadID] = !adminMode[message.threadID];
    const status = adminMode[message.threadID] ? "bật" : "tắt";
    const response = commands['.admin'].response.replace("{status}", status);
    api.sendMessage(response, message.threadID);
}

function sendCurrentTime(api, threadID) {
    const currentTime = new Date().toLocaleString();
    api.sendMessage(commands.time + currentTime, threadID);
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
            const response = commands.kick
                .replace("{user}", taggedUser.tag);
            api.sendMessage(response, message.threadID);
        }
    });
}

function handleSetBdCommand(api, message, taggedUser, newNickname) {
    api.changeNickname(newNickname, message.threadID, taggedUser.id, (err) => {
        if (err) {
            console.error("Lỗi khi đổi biệt danh:", err);
            api.sendMessage(`Lỗi khi đổi biệt danh: ${err.error || err.message || JSON.stringify(err)}`, message.threadID);
        } else {
            const response = commands.setbd
                .replace("{user}", taggedUser.tag)
                .replace("{nickname}", newNickname);
            api.sendMessage(response, message.threadID);
        }
    });
}

function handleBanCommand(api, message, commandArgs) {
    if (commandArgs.length < 2) {
        api.sendMessage("Vui lòng tag người cần ban.", message.threadID);
        return;
    }
    const banUser = message.mentions[Object.keys(message.mentions)[0]];
    if (banUser) {
        // Thực hiện hành động ban ở đây (ví dụ: thêm vào danh sách đen)
        api.sendMessage(`Đã ban ${Object.values(message.mentions)[0]}.`, message.threadID);
    } else {
        api.sendMessage("Không tìm thấy người dùng để ban.", message.threadID);
    }
}

function handleUnbanCommand(api, message, commandArgs) {
    if (commandArgs.length < 2) {
        api.sendMessage("Vui lòng nhập ID người cần unban.", message.threadID);
        return;
    }
    const unbanUserId = commandArgs[1];
    // Thực hiện hành động unban ở đây (ví dụ: xóa khỏi danh sách đen)
    api.sendMessage(`Đã unban người dùng có ID ${unbanUserId}.`, message.threadID);
}

function handleMuteCommand(api, message, commandArgs) {
    if (commandArgs.length < 2) {
        api.sendMessage("Vui lòng tag người cần mute.", message.threadID);
        return;
    }
    const muteUser = message.mentions[Object.keys(message.mentions)[0]];
    if (muteUser) {
        // Thực hiện hành động mute ở đây
        api.sendMessage(`Đã mute ${Object.values(message.mentions)[0]}.`, message.threadID);
    } else {
        api.sendMessage("Không tìm thấy người dùng để mute.", message.threadID);
    }
}

function handleUnmuteCommand(api, message, commandArgs) {
    if (commandArgs.length < 2) {
        api.sendMessage("Vui lòng tag người cần unmute.", message.threadID);
        return;
    }
    const unmuteUser = message.mentions[Object.keys(message.mentions)[0]];
    if (unmuteUser) {
        // Thực hiện hành động unmute ở đây
        api.sendMessage(`Đã unmute ${Object.values(message.mentions)[0]}.`, message.threadID);
    } else {
        api.sendMessage("Không tìm thấy người dùng để unmute.", message.threadID);
    }
}


function handleChangeColorCommand(api, message) {
    api.changeThreadColor("#000000", message.threadID, (err) => {
        if (err) {
            console.error("Lỗi khi thay đổi màu nhóm chat:", err);
            api.sendMessage("Không thể thay đổi màu nhóm chat.", message.threadID);
        } else {
            api.sendMessage("Đã thay đổi màu nhóm chat thành công.", message.threadID);
        }
    });
}

async function handlePingCommand(api, message, contentAfterCommand) {
    if (!contentAfterCommand) {
        api.sendMessage("Vui lòng nhập nội dung cần thông báo sau lệnh .ping", message.threadID);
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
                    tag: '\u200B', // Zero-width space
                    id: participantIDs[i],
                    fromIndex: i,
                });
            }
        }

        // Thêm zero-width spaces vào đầu tin nhắn để tag mọi người
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

function handleHelpCommand(api, message) {
    let helpMessage = "Đây là danh sách các lệnh:\n\n";
    
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

login({appState: appstate, forceLogin: true}, (err, api) => {
    if(err) {
        console.error("Lỗi đăng nhập:", err);
        return;
    }

    console.log("Đăng nhập thành công!");

    api.listenMqtt(async (err, message) => {
        if(err) return console.error("Lỗi khi lắng nghe tin nhắn:", err);

        if (message.type === 'message' && message.body) {
            const fullBody = message.body.trim();
            const commandArgs = fullBody.split(' ');
            const command = commandArgs[0].toLowerCase();

            let taggedUser = null;
            let contentAfterTag = '';

            if (message.mentions && Object.keys(message.mentions).length > 0) {
                const mentionedUserId = Object.keys(message.mentions)[0];
                const mentionedName = message.mentions[mentionedUserId];
                taggedUser = {
                    id: mentionedUserId,
                    tag: mentionedName
                };
                const tagIndex = fullBody.indexOf(mentionedName);
                if (tagIndex !== -1) {
                    contentAfterTag = fullBody.substring(tagIndex + mentionedName.length).trim();
                }
            }

            if (adminMode[message.threadID] && adminCommands.includes(command)) {
                const isUserAdmin = await isAdmin(api, message.senderID, message.threadID);
                if (!isUserAdmin) {
                    api.sendMessage(commands.admin_only, message.threadID);
                    return;
                }
            }

            handleCommand(api, message, command, commandArgs, taggedUser, contentAfterTag);
        }
    });
});