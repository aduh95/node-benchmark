# node-benchmark

Suite of scripts to help pin-point changes that are causing perf regressions,
and revert them.

`bisectFileChanges` will try to isolate all the changes made in a given file,
and compile a version without each change. You can then run
`revertNonPerfChanges` to revert those who are causing perf regressions.

### Usage

Commands to run from `node` git repo folder:

```console
$ <this-repo-path>/bisectFileChanges.mjs <path> <benchmark-family> <benchmark-args> | sh
$ <this-repo-path>/revertNonPerfChanges.mjs <compare.R-path> benchmark.tar.gz <threshold?=9> | git apply
```
