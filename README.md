# Jo

`Jo` is a simple and scalable code generator that works. Built for developers by developers with ❤️.

### Features

-   🏗️ JavaScript as a template language — do what you want with any other packages in your templates;
-   🎨 Hooks for any state — format, validate, whatever with your templates;
-   🚀 Support templates as npm-package — share templates between teams and projects;
-   🎩 Support [brace expansion](https://www.gnu.org/software/bash/manual/html_node/Brace-Expansion.html) as known from sh/bash;
-   💪 Command templates etending and overriding.

## Usage

```bash
$ npm i -D jo-cli
```

### Command config

Add to `templates` directory first templates via folder `component` and populate command config.

**templates/component/.joconfig.js**

```js
const { pascalCase } = require('change-case');

module.exports = {
    title: 'React Component',
    default: 'js',
    path: ({ options }, filename) => (options.directory ? `./src/components/${filename}` : './src/components'),
    description: 'Create React component in different technologies.',
    options: {
        directory: {
            type: 'boolean',
            short: 'd',
            description: 'create component as directory',
        },
        module: {
            type: 'string',
            short: 'm',
            description: 'Sub module',
            parse: pascalCase,
        },
    },
    hooks: {
        preFileName: (_, filename) => pascalCase(filename),
    },
};
```

### Template

Add template files with name to extension matching.

**templates/component/js.js**

```js
module.exports.template = ({ directory }, fileName) =>
    `import React from 'react';

    export const ${fileName} = props => <div>${directory ? 'in direcotory' : 'one file'}</div>;`;
```

**templates/component/css.js**

```js
module.exports.template = (_, fileName) => `.${fileName} {}`;
```

### Run it!

```bash
$ jo component tabs.{js,css} menu -d
```

Wait for magic! 🐰

```
src
└── components
    ├── Menu
    │   └── Menu.js
    └── Tabs
        ├── Tabs.css
        └── Tabs.js
```

## CLI

### Help

```bash
$ jo -h
```

```
Usage: jo [options] [command]

Options:
  -V, --version        output the version number
  -h, --help           display help for command

Commands:
  component [options]  Create React component in different technologies.
  help [command]       display help for command
```

```bash
$ jo component -h
```

```
Usage: jo component [options]

Create React component in different technologies.

Options:
  -f, --force      override existing files
  -d, --directory  create component as directory
  -h, --help       display help for command
```

## Configure

Add `.joconfig.js` to your project root directory.

```js
module.exports = {
    templates: [
        'react-jo-templates', // name of package with templates
        'bem-jo-templates',
        'blog-jo-templates',
        'path/to/your/templates', // templates by default
    ],
    logMode: 'silent', // verbose, short — verbose by default
};
```

### Customize path for any template

**templates/component/test.js.js**

```js
module.exports.path = ({ options, path, extension }, fileName) =>
    options.directory ? `${path}/${fileName}.test/${options.module}.${extension}` : `${path}/${fileName}.${extension}`;

module.exports.template = (_, fileName) => `
test('${fileName}');
`;
```

```bash
$ jo component menu.test.js -d -m base
```

```
src
└── components
    └── Menu
        └── Menu.test
            └── Base.test.js
```

## Hooks

### preFileName(meta, filname)

Calls before the filename will be created. Use it to customize naming with your team guides.

```js
const { pascalCase } = require('change-case');

module.exports = {
    //...
    hooks: {
        preFileName: (_, filename) => pascalCase(filename),
    },
};
```

### preFileSave(meta, filname)

Calls before the file content will be saved. Use it to format or any other magic.

```js
const prettier = require('prettier');

module.exports = {
    //...
    hooks: {
        preFileSave: (_, content) => prettier.format(content),
    },
};
```

## Extends

You can base your command on any other. Override command config, add or override templates for any file exetensions.

```js
module.exports = {
    extends: 'react-jo-templates/templates/react',
    description: 'Styled React components',
};
```
