#!/usr/bin/env node

import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import readline from "readline";

const [, , file, benchmark, args] = process.argv;
const { length: cpuCores } = os.cpus();

const gitDiff = spawn("git", ["diff", "HEAD", "upstream/master", file]);
gitDiff.on("error", console.error);

const asyncWork = [];
const diffSep = /^@@\s-\d+,\d+\s\+(\d+),\d+\s@@/;

let header = "";
let readingHeader = true;
let currentOutput;
for await (const line of readline.createInterface({ input: gitDiff.stdout })) {
  if (diffSep.test(line)) {
    readingHeader = false;

    const currentLineNumber = line.match(diffSep)[1];
    currentOutput?.close();
    currentOutput = fs.createWriteStream(
      `${benchmark}-${currentLineNumber}.diff`
    );
    currentOutput.write(header);
    console.log(
      `git reset --hard && git apply ${benchmark}-${currentLineNumber}.diff && make -j8 && mv out/Release/node ${benchmark}-${currentLineNumber}.exe || SKIP_${currentLineNumber}=1`
    );
    asyncWork.push(
      `[ -z $SKIP_${currentLineNumber} ] && (node benchmark/compare.js --new ./${benchmark}-${currentLineNumber}.exe --old ./node_master ${
        args ?? ""
      } -- ${benchmark} > ${benchmark}-${currentLineNumber}.csv || rm ${benchmark}-${currentLineNumber}.csv)&`
    );
  }

  if (readingHeader) header += `${line}\n`;
  else currentOutput.write(`${line}\n`);
}
currentOutput?.close();
asyncWork.forEach((e, i) => {
  console.log(e);
  if (i % cpuCores === cpuCores - 1) console.log("wait");
});
console.log("wait");
