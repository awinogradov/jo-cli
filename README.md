# Jo

`Jo` is a simple and scalable code generator that works. Built for developers by developers with ❤️.

### Features

- 🏗️ JavaScript as a template language — do what you want with any other packages in your templates;
- 🎨 Hooks for any state — format, validate, whatever with your templates;
- 🚀 Support templates as npm-package — share tmeplates between teams and projects;
- 🎩 Support [brace expansion](https://www.gnu.org/software/bash/manual/html_node/Brace-Expansion.html) as known from sh/bash.

## Usage

``` bash
$ npm i -D jo-cli
```

### Command config

Add to `.templates` first templates via folder `component` and populate command config.

__.templates/component/.joconfig.js__
``` js
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
        }
    },
    hooks: {
        preFileName({ payload: filename }) {
            return pascalCase(filename);
        },
        prePath({ options, payload: filename }) {
            return options.directory ? `./src/components/${filename}` : './src/components';
        }
    },
};
```

### Template

Add template files with name to extension matching.

__.templates/component/js.js__
``` js
module.exports.template = ({ directory }, fileName) => {
    const content = directory ? 'in direcotory' : 'one file';

    return (
        `import React from 'react';

        export const ${fileName} = props => <div>${content}</div>;`
    );
}
```

__.templates/component/css.js__
``` js
module.exports.template = (_, fileName) => `.${fileName} {}`;
```

### Run it!

``` bash
$ jo component tabs.{js,css} menu -d
```

Wait for magic!

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

``` bash
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

``` bash
$ jo component -h
```

```
Usage: jo component [options]

Create React component in different technologies.

Options:
  -f, --force      Override existing files
  -d, --directory  create component as directory
  -h, --help       display help for command
```

## Configure

Add `.joconfig.js` to your project root directory.

``` js
module.exports = {
    templates: [
      `path/to/your/templates`, // .templates by default
    ],
    logMode: 'silent', // verbose, short — verbose by default
};
```
