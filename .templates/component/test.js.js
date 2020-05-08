module.exports.path = ({ options, path, extension }, fileName) =>
    options.directory ? `${path}/${fileName}.test/${options.module}.${extension}` : `${path}/${fileName}.${extension}`;

module.exports.template = (_, fileName) => `
test('${fileName}');
`;
