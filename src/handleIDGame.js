const fs = require('fs').promises;
const path = require('path');

const GAME_IDS_FILE = path.join(__dirname, '..', 'data', 'gameIDs.json');

async function handleSetIdGameCommand(api, message, taggedUser, newGameId, commands) {
    console.log("handleSetIdGameCommand được gọi với:", { message, taggedUser, newGameId, commands });
    let targetUser;
    if (taggedUser) {
        targetUser = taggedUser;
    } else {
        targetUser = { id: message.senderID, tag: 'Bạn' };
    }

    if (!newGameId) {
        newGameId = message.body.split(' ').slice(1).join(' ').trim();
        if (!newGameId) {
            api.sendMessage("Vui lòng nhập ID game mới.", message.threadID);
            return;
        }
    }

    try {
        const gameIDs = await readJSONFile(GAME_IDS_FILE);
        if (!gameIDs[message.threadID]) {
            gameIDs[message.threadID] = {};
        }
        gameIDs[message.threadID][targetUser.id] = newGameId;
        await writeJSONFile(GAME_IDS_FILE, gameIDs);

        const response = commands['.setidgame'].response
            .replace("{user}", targetUser.tag)
            .replace("{newGameId}", newGameId);
        console.log("Chuẩn bị gửi tin nhắn:", response);
        api.sendMessage(response, message.threadID, (err) => {
            if (err) {
                console.error("Lỗi khi gửi tin nhắn:", err);
            } else {
                console.log("Đã gửi tin nhắn thành công");
            }
        });
    } catch (error) {
        console.error("Lỗi khi cập nhật ID game:", error);
        api.sendMessage("Có lỗi xảy ra khi cập nhật ID game.", message.threadID);
    }
}

async function handleIdCommand(api, message, taggedUser) {
    let targetUser;
    if (taggedUser) {
        targetUser = taggedUser;
    } else {
        targetUser = { id: message.senderID, tag: 'Bạn' };
    }

    try {
        const gameIDs = await readJSONFile(GAME_IDS_FILE);
        const threadGameIDs = gameIDs[message.threadID] || {};
        const gameID = threadGameIDs[targetUser.id];

        if (gameID) {
            const response = `ID game của ${targetUser.tag}: ${gameID}`;
            api.sendMessage(response, message.threadID);
        } else {
            api.sendMessage(`Không tìm thấy ID game cho ${targetUser.tag}.`, message.threadID);
        }
    } catch (error) {
        console.error("Lỗi khi đọc ID game:", error);
        api.sendMessage("Có lỗi xảy ra khi đọc ID game.", message.threadID);
    }
}

async function readJSONFile(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return {};
        }
        throw error;
    }
}

async function writeJSONFile(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

module.exports = { handleIdCommand, handleSetIdGameCommand };