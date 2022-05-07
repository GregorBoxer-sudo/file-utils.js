# file-utils.js
 Can handle simultaneous actions for files!

## get Started
```javascript
    const FileHander = require("file-utils.js");
    
    // initialize FileHandler with 100 max simultaneous actions and 100 ms retry-rate    
    const fileHandler = new FileHandler(100, 100);
    
    // write file test
    fileHander.write("./test.txt", "hello World");

    async function readFile() {
        console.log(await fileHander.read("./test.txt"));    
    }

    readFile();
```