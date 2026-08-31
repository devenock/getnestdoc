# getnestdoc

NestJS documentation in your terminal. `go doc`, for Nest.

```console
$ nest-doc interceptors          # the guide, offline
$ nest-doc common.Injectable     # signature + JSDoc from your node_modules
$ nest-doc @nestjs/common        # everything the package exports
```

> Installs as `getnestdoc`, runs as `nest-doc`.

Recorded demo (real output, [`demo.cast`](./demo.cast)):

```console
$ asciinema play demo.cast
```

<!-- Once uploaded to asciinema.org, replace the block above with:
[![asciicast](https://asciinema.org/a/REPLACE_ME.svg)](https://asciinema.org/a/REPLACE_ME) -->

## Why

Nest is well documented. That documentation is just hard to reach from a terminal.

The API docs are already on your disk — every Nest package ships `.d.ts` files with full JSDoc, tagged `@publicApi`. `@nestjs/common` alone carries 220 of those tags. To read any of it you open a browser, or hover in an editor over a symbol you have already imported, or `cat` a declaration file by hand.

The guides aren't on your disk at all. They live at docs.nestjs.com, and Nest's own JSDoc links to them 47 times in `@nestjs/common` — pointing at pages you can't reach without leaving the terminal.

`nest-doc` closes both gaps. No browser, no network, no editor.

## Install

```bash
npm i -g getnestdoc     # or: pnpm add -g getnestdoc / yarn global add getnestdoc
```

Node 22.6 or newer.

## Usage

```console
$ nest-doc <query>              guide or symbol, auto-detected
$ nest-doc <query> --guide      force a guide lookup
$ nest-doc <query> --api        force a symbol lookup
$ nest-doc --all <package>      every export, not just the public ones
$ nest-doc <query> --js         show JavaScript code samples instead of TypeScript
$ nest-doc update               refresh the bundled guides
$ nest-doc --clear-cache        drop the cached symbol data
```

Guides resolve by concept, the way you actually think about Nest:

```console
$ nest-doc guards
$ nest-doc custom-decorators
$ nest-doc providers            # the docs call this file components.md; we handle that
```

Symbols resolve against **your** `node_modules`, so you get the version you actually have installed:

```console
$ nest-doc common.Injectable
$ nest-doc @nestjs/core.Reflector
$ nest-doc @nestjs/common        # everything the package exports
```

Or skip the package name — type what you actually see in the code:

```console
$ nest-doc @Get                 # same decorator, same answer
$ nest-doc Get
```

Long output pages automatically through `$PAGER` (or `less`) when you're at a real terminal — scroll and `/search` like any man page. Piped or redirected output skips paging entirely and stays plain text, so it composes:

```console
$ nest-doc --all @nestjs/common | grep -i pipe
```

## How it works

Two sources behind one command.

**Guides** are vendored at build time from `nestjs/docs.nestjs.com` (MIT) — 143 markdown files, pre-tokenised and shipped inside the package. No network at lookup time.

**Symbols** are read from the `.d.ts` files in the nearest `node_modules`, parsed directly rather than type-checked, and cached per package version. First lookup for a package takes a moment; every one after is instant.

The two link up. Nest's JSDoc `@see` tags point at docs.nestjs.com URLs, which resolve to the local guides — so a symbol lookup can hand you the relevant guide section without a browser.

Full detail in [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Speed

It has to beat alt-tabbing to a browser or there's no point. Target is under 150 ms for a lookup, measured in CI on every commit.

## What this isn't

- **Not a documentation generator.** [TypeDoc](https://typedoc.org) and [Compodoc](https://compodoc.app) do that well. This reads docs; it doesn't produce them.
- **Not for your own app.** v1 documents the framework. Compodoc covers your codebase.
- **Not a TUI.** No menus, no persistent state, no navigation beyond what your pager already gives you. It prints and exits — long output pages automatically, that's the only exception.
- **Not official.** Unaffiliated with the NestJS project.

## Attribution

Guide content is from [nestjs/docs.nestjs.com](https://github.com/nestjs/docs.nestjs.com), MIT licensed, copyright © 2017-present Kamil Myśliwiec. Vendored and reformatted for terminal display; the text is theirs.

NestJS is a trademark of its owners. This project is independent.

## Licence

MIT
