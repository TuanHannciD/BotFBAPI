const login = require("facebook-chat-api");
const fs = require("fs");

const appState = JSON.parse(fs.readFileSync('./data/appstate.json', 'utf8'));

login({appState: appState}, (err, api) => {
    if(err) return console.error(err);

    api.changeNickname("New Nickname", "8327912243898512", "100072408824567", (err) => {
        if(err) return console.error(err);
        console.log("Changed nickname successfully!");
    });
});