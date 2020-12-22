# node-benchmark

Suite of scripts to help pin-point changes that are causing perf regressions,
and revert them.

`bisectFileChanges` will try to isolate all the changes made in a given file,
and compile a version without each change. You can then run
`revertNonPerfChanges` to revert those who are causing perf regressions.

### Usage

```console
$ ./bisectFileChanges.mjs <file-path> <benchmark-family> <benchmark-args> | sh
$ rm *.diff
$ mv *.csv <path-where-csv-files-are-stored>
$ ls -1 <path-where-csv-files-are-stored>/*.csv | ./revertNonPerfChanges.mjs <compare.R-path> <file-path> | git apply
```
