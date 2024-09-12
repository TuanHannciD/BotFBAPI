const fs = require('fs').promises;
const login = require("facebook-chat-api");
const { handleNewMember } = require('./src/handleNewMember.js');
const path = require('path');

let commands;
const adminMode = {};
const adminCommands = ['.kick', '.ban', '.unban', '.mute', '.unmute'];

const BANNED_USERS_FILE = path.join(__dirname, 'data', 'bannedUsers.json');
const MUTED_USERS_FILE = path.join(__dirname, 'data', 'mutedUsers.json');

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
        api.listenMqtt((err, event) => {
            if (err) return console.error("Lỗi khi lắng nghe sự kiện:", err);

            if (event.type === "message") {
                handleMessage(api, null, event);
            } else if (event.type === "event" && event.logMessageType === "log:subscribe") {
                handleNewMember(api, event);
            }
        });
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
    const contentAfterCommand = message.body.substring(command.length).trim();

    let taggedUser = null;
    let contentAfterTag = '';

    if (message.mentions && Object.keys(message.mentions).length > 0) {
        const [mentionedUserId, mentionedName] = Object.entries(message.mentions)[0];
        taggedUser = { id: mentionedUserId, tag: mentionedName };
        const tagIndex = fullBody.indexOf(mentionedName);
        if (tagIndex !== -1) {
            contentAfterTag = fullBody.substring(tagIndex + mentionedName.length).trim();
        }
    } else if (fullBody.includes('@me')) {
        taggedUser = { id: message.senderID, tag: '@me' };
        const tagIndex = fullBody.indexOf('@me');
        if (tagIndex !== -1) {
            contentAfterTag = fullBody.substring(tagIndex + '@me'.length).trim();
        }
    }

    if (adminMode[message.threadID] && adminCommands.includes(command)) {
        const isUserAdmin = await isAdmin(api, message.senderID, message.threadID);
        if (!isUserAdmin) {
            api.sendMessage(commands.admin_only.response, message.threadID);
            return;
        }
    }

    handleCommand(api, message, command, commandArgs, taggedUser, contentAfterTag, contentAfterCommand);
}

const { handleIdCommand, handleSetIdGameCommand } = require('./src/handleIDGame.js');

function handleCommand(api, message, command, commandArgs, taggedUser, contentAfterTag, contentAfterCommand) {
    const commandHandlers = {
        'hello': () => api.sendMessage(commands.hello.response, message.threadID),
        '.help': () => handleHelpCommand(api, message),
        '.time': () => sendCurrentTime(api, message.threadID),
        '.admin': () => handleAdminCommand(api, message),
        '.kick': () => handleKickCommand(api, message, taggedUser),
        '.ban': () => handleBanCommand(api, message, taggedUser),
        '.unban': () => handleUnbanCommand(api, message, commandArgs[1]),
        '.mute': () => handleMuteCommand(api, message, taggedUser),
        '.unmute': () => handleUnmuteCommand(api, message, taggedUser),
        '.setbd': () => handleSetBdCommand(api, message, taggedUser, contentAfterTag),
        '.ping': () => handlePingCommand(api, message, contentAfterCommand),
        'id': () => handleIdCommand(api, message, taggedUser),
        '.setidgame': async () => {
            console.log("Gọi handleSetIdGameCommand với:", { message, taggedUser, contentAfterTag, commands });
            await handleSetIdGameCommand(api, message, taggedUser, contentAfterTag, commands);
        }
    };

    const handler = commandHandlers[command];
    if (handler) {
        handler();
    } else {
        // Xử lý khi không tìm thấy lệnh
    }
}

function handleHelpCommand(api, message) {
    if (!commands['.help'] || !commands['.help'].response) {
        console.error("Lỗi: Không tìm thấy thông tin lệnh help");
        api.sendMessage("Xin lỗi, hiện tại không thể hiển thị thông tin trợ giúp.", message.threadID);
        return;
    }

    let helpMessage = commands['.help'].response + "\n\n";
    
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
            const response = commands['.kick'].response.replace("{user}", taggedUser.tag);
            api.sendMessage(response, message.threadID);
        }
    });
}

async function handleBanCommand(api, message, taggedUser) {
    if (!taggedUser) {
        api.sendMessage("Vui lòng tag người cần ban.", message.threadID);
        return;
    }

    try {
        await saveBannedUser(message.threadID, taggedUser.id);
        api.removeUserFromGroup(taggedUser.id, message.threadID, (err) => {
            if (err) {
                console.error("Lỗi khi ban người dùng:", err);
                api.sendMessage(`Không thể ban người dùng. Lỗi: ${err.error || err.message || JSON.stringify(err)}`, message.threadID);
            } else {
                const response = commands['.ban'].response.replace("{user}", taggedUser.tag);
                api.sendMessage(response, message.threadID);
            }
        });
    } catch (error) {
        console.error("Lỗi khi lưu thông tin người bị ban:", error);
        api.sendMessage("Có lỗi xảy ra khi ban người dùng.", message.threadID);
    }
}

async function handleUnbanCommand(api, message, userID) {
    if (!userID) {
        api.sendMessage("Vui lòng cung cấp ID người dùng cần unban.", message.threadID);
        return;
    }

    try {
        const isBanned = await isUserBanned(message.threadID, userID);
        if (isBanned) {
            await removeBannedUser(message.threadID, userID);
            const response = commands['.unban'].response.replace("{userID}", userID);
            api.sendMessage(response, message.threadID);
        } else {
            api.sendMessage("Người dùng này không bị ban.", message.threadID);
        }
    } catch (error) {
        console.error("Lỗi khi unban người dùng:", error);
        api.sendMessage("Có lỗi xảy ra khi unban người dùng.", message.threadID);
    }
}

async function handleMuteCommand(api, message, taggedUser) {
    if (!taggedUser) {
        api.sendMessage("Vui lòng tag người cần mute.", message.threadID);
        return;
    }

    try {
        await saveMutedUser(message.threadID, taggedUser.id);
        const response = commands['.mute'].response.replace("{user}", taggedUser.tag);
        api.sendMessage(response, message.threadID);
    } catch (error) {
        console.error("Lỗi khi mute người dùng:", error);
        api.sendMessage("Có lỗi xảy ra khi mute người dùng.", message.threadID);
    }
}

async function handleUnmuteCommand(api, message, taggedUser) {
    if (!taggedUser) {
        api.sendMessage("Vui lòng tag người cần unmute.", message.threadID);
        return;
    }

    try {
        const isMuted = await isUserMuted(message.threadID, taggedUser.id);
        if (isMuted) {
            await removeMutedUser(message.threadID, taggedUser.id);
            const response = commands['.unmute'].response.replace("{user}", taggedUser.tag);
            api.sendMessage(response, message.threadID);
        } else {
            api.sendMessage("Người dùng này không bị mute.", message.threadID);
        }
    } catch (error) {
        console.error("Lỗi khi unmute người dùng:", error);
        api.sendMessage("Có lỗi xảy ra khi unmute người dùng.", message.threadID);
    }
}

function handleSetBdCommand(api, message, taggedUser, newNickname) {
    if (!newNickname) {
        api.sendMessage(commands['.setbd'].usage, message.threadID);
        return;
    }

    const targetUserID = taggedUser ? taggedUser.id : message.senderID;
    const targetUserTag = taggedUser ? (taggedUser.tag === '@me' ? '@Bạn' : taggedUser.tag) : '@Bạn';

    api.changeNickname(newNickname, message.threadID, targetUserID, (err) => {
        if (err) {
            console.error("Lỗi khi đổi biệt danh:", err);
            api.sendMessage(`Lỗi khi đổi biệt danh: ${err.error || err.message || JSON.stringify(err)}`, message.threadID);
        } else {
            const response = commands['.setbd'].response
                .replace("{user}", targetUserTag)
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
        // Lấy thông tin về thread
        const threadInfo = await new Promise((resolve, reject) => {
            api.getThreadInfo(message.threadID, (err, info) => {
                if (err) reject(err);
                else resolve(info);
            });
        });

        // Tạo một chuỗi ký tự không hiển thị
        const invisibleChar = '\u200B'; // Zero-width space

        // Tạo danh sách mentions cho tất cả thành viên
        const mentions = threadInfo.participantIDs.map((id, index) => ({
            tag: invisibleChar.repeat(index + 1),
            id: id,
            fromIndex: contentAfterCommand.length,
        }));

        // Tạo chuỗi ký tự không hiển thị cho tất cả mentions
        const invisibleMentions = mentions.map(m => m.tag).join('');

        // Gửi tin nhắn với nội dung và mentions ẩn
        await new Promise((resolve, reject) => {
            api.sendMessage({
                body: contentAfterCommand + invisibleMentions,
                mentions: mentions
            }, message.threadID, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

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

function handleChangeColorCommand(api, message) {
    const colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#00FFFF', '#FF00FF'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    api.changeThreadColor(randomColor, message.threadID, (err) => {
        if (err) {
            console.error("Lỗi khi thay đổi màu nhóm chat:", err);
            api.sendMessage("Có lỗi xảy ra khi thay đổi màu nhóm chat.", message.threadID);
        } else {
            api.sendMessage(commands['.changecolor'].response, message.threadID);
        }
    });
}

// Hàm đọc dữ liệu từ file JSON
async function readJSONFile(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            // File không tồn tại, trả về object rỗng
            return {};
        }
        throw error;
    }
}

// Hàm ghi dữ liệu vào file JSON
async function writeJSONFile(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// Hàm lưu người dùng bị ban
async function saveBannedUser(threadID, userID) {
    const bannedUsers = await readJSONFile(BANNED_USERS_FILE);
    if (!bannedUsers[threadID]) {
        bannedUsers[threadID] = [];
    }
    if (!bannedUsers[threadID].includes(userID)) {
        bannedUsers[threadID].push(userID);
        await writeJSONFile(BANNED_USERS_FILE, bannedUsers);
    }
}

// Hàm xóa người dùng khỏi danh sách bị ban
async function removeBannedUser(threadID, userID) {
    const bannedUsers = await readJSONFile(BANNED_USERS_FILE);
    if (bannedUsers[threadID]) {
        bannedUsers[threadID] = bannedUsers[threadID].filter(id => id !== userID);
        await writeJSONFile(BANNED_USERS_FILE, bannedUsers);
    }
}

// Hàm kiểm tra người dùng có bị ban không
async function isUserBanned(threadID, userID) {
    const bannedUsers = await readJSONFile(BANNED_USERS_FILE);
    return bannedUsers[threadID] && bannedUsers[threadID].includes(userID);
}

// Hàm lưu người dùng bị mute
async function saveMutedUser(threadID, userID) {
    const mutedUsers = await readJSONFile(MUTED_USERS_FILE);
    if (!mutedUsers[threadID]) {
        mutedUsers[threadID] = [];
    }
    if (!mutedUsers[threadID].includes(userID)) {
        mutedUsers[threadID].push(userID);
        await writeJSONFile(MUTED_USERS_FILE, mutedUsers);
    }
}

// Hàm xóa người dùng khỏi danh sách bị mute
async function removeMutedUser(threadID, userID) {
    const mutedUsers = await readJSONFile(MUTED_USERS_FILE);
    if (mutedUsers[threadID]) {
        mutedUsers[threadID] = mutedUsers[threadID].filter(id => id !== userID);
        await writeJSONFile(MUTED_USERS_FILE, mutedUsers);
    }
}

// Hàm kiểm tra người dùng có bị mute không
async function isUserMuted(threadID, userID) {
    const mutedUsers = await readJSONFile(MUTED_USERS_FILE);
    return mutedUsers[threadID] && mutedUsers[threadID].includes(userID);
}

// Khởi động bot
startBot();