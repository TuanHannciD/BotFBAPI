const fs = require('fs');
const { promisify } = require('util');
const stream = require('stream');
const axios = require('axios');

const pipeline = promisify(stream.pipeline);

async function handleNewMember(api, event) {
    console.log('Xử lý thành viên mới:', event);
    const threadID = event.threadID;
    const userID = event.logMessageData.addedParticipants[0].userFbId;
    
    try {
        const threadInfo = await getThreadInfo(api, threadID);
        const userInfo = await getUserInfo(api, userID);

        console.log('Thông tin nhóm:', threadInfo);
        console.log('Thông tin người dùng:', userInfo);

        const memberCount = threadInfo.participantIDs.length;
        const userName = userInfo.name;
        const { formattedDate, formattedTime } = getCurrentDateTime();

        const defaultNickname = `${userName} (${formattedDate})`;
        await changeNickname(api, defaultNickname, threadID, userID);

        const welcomeMessage = createWelcomeMessage(userName, threadInfo.threadName, memberCount, formattedDate, formattedTime);
        const mentions = createMentions(userName, userID, welcomeMessage);

        const profileUrl = userInfo.thumbSrc;
        console.log("URL ảnh đại diện:", profileUrl);

        if (profileUrl && profileUrl.startsWith('http')) {
            try {
                await axios.head(profileUrl);
                await sendMessageWithAttachment(api, welcomeMessage, mentions, profileUrl, threadID);
            } catch (error) {
                console.error("Không thể truy cập URL ảnh đại diện:", error);
                await sendMessageWithoutAttachment(api, welcomeMessage, mentions, threadID);
            }
        } else {
            console.log("URL ảnh đại diện không hợp lệ, sử dụng phương thức gửi tin nhắn không kèm ảnh");
            await sendMessageWithoutAttachment(api, welcomeMessage, mentions, threadID);
            return;
        }
    } catch (err) {
        console.error("Lỗi khi xử lý thành viên mới:", err);
        await sendErrorMessage(api, threadID);
    }
}

function getThreadInfo(api, threadID) {
    return new Promise((resolve, reject) => {
        api.getThreadInfo(threadID, (err, info) => {
            if (err) reject(err);
            else resolve(info);
        });
    });
}

function getUserInfo(api, userID) {
    return new Promise((resolve, reject) => {
        api.getUserInfo(userID, (err, info) => {
            if (err) reject(err);
            else resolve(info[userID]);
        });
    });
}

function getCurrentDateTime() {
    const currentTime = new Date();
    const formattedDate = `${currentTime.getDate().toString().padStart(2, '0')}/${(currentTime.getMonth() + 1).toString().padStart(2, '0')}/${currentTime.getFullYear()}`;
    const formattedTime = `${currentTime.getHours().toString().padStart(2, '0')}:${currentTime.getMinutes().toString().padStart(2, '0')}:${currentTime.getSeconds().toString().padStart(2, '0')} ${currentTime.getHours() >= 12 ? 'PM' : 'AM'}`;
    return { formattedDate, formattedTime };
}

function changeNickname(api, nickname, threadID, userID) {
    return new Promise((resolve, reject) => {
        api.changeNickname(nickname, threadID, userID, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function createWelcomeMessage(userName, threadName, memberCount, formattedDate, formattedTime) {
    return `️
    [🇻🇳] Xin chào ${userName}!
    [🇻🇳] Chào mừng bạn đến với nhóm | ${threadName} |
    [🇻🇳] Bạn là thành viên thứ ${memberCount} của nhóm 
    [🇻🇳] Chúc bạn có một ${getCurrentTimePeriod()} vui vẻ
    [🇻🇳] Ngày vào: ${formattedDate}||${formattedTime}`;
}

function createMentions(userName, userID, welcomeMessage) {
    return [{
        tag: userName,
        id: userID,
        fromIndex: welcomeMessage.indexOf(userName),
    }];
}

async function sendMessageWithAttachment(api, welcomeMessage, mentions, thumbSrc, threadID) {
    console.log("URL ảnh đại diện:", thumbSrc);
    try {
        if (!thumbSrc) {
            throw new Error("URL ảnh đại diện không hợp lệ");
        }

        const response = await axios({
            method: 'get',
            url: thumbSrc,
            responseType: 'stream'
        });
        
        const tempFilePath = `./temp_${Date.now()}.jpg`;
        await pipeline(response.data, fs.createWriteStream(tempFilePath));

        await new Promise((resolve, reject) => {
            api.sendMessage({
                body: welcomeMessage,
                mentions: mentions,
                attachment: fs.createReadStream(tempFilePath)
            }, threadID, (err) => {
                fs.unlink(tempFilePath, () => {});
                if (err) reject(err);
                else resolve();
            });
        });
    } catch (fetchError) {
        console.error("Lỗi khi tải ảnh đại diện:", fetchError);
        await sendMessageWithoutAttachment(api, welcomeMessage, mentions, threadID);
    }
}

function sendMessageWithoutAttachment(api, welcomeMessage, mentions, threadID) {
    return new Promise((resolve, reject) => {
        api.sendMessage({
            body: welcomeMessage,
            mentions: mentions
        }, threadID, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function sendErrorMessage(api, threadID) {
    return new Promise((resolve, reject) => {
        api.sendMessage("Có lỗi xảy ra khi chào mừng thành viên mới.", threadID, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function getCurrentTimePeriod() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return "buổi sáng";
    if (hour >= 12 && hour < 18) return "buổi chiều";
    return "buổi tối";
}

module.exports = {
    handleNewMember
};