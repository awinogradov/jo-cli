const { pascalCase } = require('change-case');

module.exports = {
    default: 'js',
    title: 'React Component',
    description: 'Create React component in different technologies.',
    options: {
        directory: {
            type: 'boolean',
            short: 'd',
            description: 'Create as directory',
        },
        fc: {
            type: 'boolean',
            description: 'Functional Component',
        },
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
