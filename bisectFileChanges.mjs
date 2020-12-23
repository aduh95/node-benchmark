#!/usr/bin/env node

import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import process from "process";
import readline from "readline";

const [, , path2diff, benchmark, args] = process.argv;
const { length: cpuCores } = os.cpus();

if (process.argv.length < 4) {
  console.error("Usage: $0 <path> <benchmark> <args?>");
  console.error("\t Example: $0 lib/ events '--runs 99 --filter ee'");
  process.exit(1);
}

const gitDiff = spawn("git", ["diff", "HEAD", "upstream/master", path2diff]);
gitDiff.on("error", console.error);
gitDiff.stderr.pipe(process.stderr);

const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "foo-"));

const asyncWork = [];
const diffSep = /^@@\s-\d+,\d+\s\+(\d+),\d+\s@@/;

let header;
let readingHeader;
let currentOutput;
let fileName;
let skipIndex = 0;
for await (const line of readline.createInterface({ input: gitDiff.stdout })) {
  if (line.startsWith("diff")) {
    readingHeader = true;
    header = "";
    fileName = `${dir}/${Buffer.from(line).toString("hex")}`;
    skipIndex++;
  }
  if (diffSep.test(line)) {
    readingHeader = false;

    const currentLineNumber = line.match(diffSep)[1];
    currentOutput?.close();
    currentOutput = fs.createWriteStream(
      `${fileName}-${currentLineNumber}.diff`
    );
    currentOutput.write(header);
    console.log(
      `git reset --hard && git apply ${fileName}-${currentLineNumber}.diff && make -j8 && mv out/Release/node ${fileName}-${currentLineNumber}.exe || SKIP_${skipIndex}_${currentLineNumber}=1`
    );
    asyncWork.push(
      `[ -z $SKIP_${skipIndex}_${currentLineNumber} ] && (node benchmark/compare.js --new ./${fileName}-${currentLineNumber}.exe --old ./node_master ${
        args ?? ""
      } -- ${benchmark} > ${fileName}-${currentLineNumber}.csv || rm ${fileName}-${currentLineNumber}.csv)&`,
      `[ -z $SKIP_${skipIndex}_${currentLineNumber} ] && rm ${fileName}-${currentLineNumber}.exe`
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
console.log(`tar -czf ${benchmark}.tar.gz -C ${dir} .`);
console.log(`rm -r ${dir}`);
