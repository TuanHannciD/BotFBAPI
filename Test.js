const login = require("facebook-chat-api");
const fs = require("fs");

const appState = JSON.parse(fs.readFileSync('./data/appstate.json', 'utf8'));

login({appState: appState}, (err, api) => {
    if(err) {
        console.error("Lỗi đăng nhập:", err);
        return;
    }

    api.changeNickname("New Nickname", "8327912243898512", "100072408824567", (err) => {
        if(err) {
            console.error("Lỗi khi thay đổi biệt danh:", err);
            return;
        }
        console.log("Thay đổi biệt danh thành công!");
    });
});