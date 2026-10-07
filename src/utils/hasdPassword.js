const bcrypt = require("bcryptjs");

const password = "referee123";

bcrypt.hash(password, 10)
    .then(hash => {
        console.log(hash);
    });