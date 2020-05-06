# Jo

`Jo` is the simple and scalable code generator that works. Builed for developers by developers with ❤️.

### Features

- 🏗️ JavaScript as template language — do what you want with any other packages in your templates;
- 🎨 Hooks for any state — format, validate, whatever with your templates;
- 🚀 Support templates as npm-package — share tmeplates between teams and projects;

## Usage

``` bash
$ npm i -D jo-cli
```

### Command config

Add to `.templates` first templates via folder `component` and populate command config.

``` js
// .templates/component/.joconfig.js

const { pascalCase } = require('change-case');

module.exports = {
    default: 'js',
    title: 'React Component',
    description: 'Create React component in different technologies.',
    options: {
        directory: {
            type: 'boolean',
            short: 'd',
            description: 'create component as directory',
        }
    },
    hooks: {
        preFilename({ payload: filename }) {
            return pascalCase(filename);
        },
        prePath({ options, payload: filename }) {
            return options.directory ? `./src/components/${filename}` : './src/components';
        }
    },
};
```

### Template

Add template files with name to extension mathcing.

``` js
// .templates/component/js.js

module.exports.template = ({ directory }, fileName) => {
    const content = directory ? 'in direcotory' : 'one file';

    return (
        `import React from 'react';

        export const ${fileName} = props => <div>${content}</div>;`
    );
}
```

``` js
// .templates/component/css.js

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

### Configure

Add `.joconfig.js` to your project root directory.

``` js
module.exports = {
    templates: [
      `path/to/your/templates`, // .templates by default
    ],
    logMode: 'silent', // verbose, short — verbose by default
};
```
