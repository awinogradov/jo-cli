import { join, relative } from 'path';
import { existsSync, outputFile } from 'fs-extra';
import { Command } from 'commander';
import { walk, WalkStats, WalkNext } from 'walk';
import braceExpansion from 'brace-expansion';
import chalk from 'chalk';

interface CliConfig {
    templates: string[];
    logMode: 'verbose' | 'silent' | 'short';
}

type CliFlags = Record<string, string>;

interface MutableStringOptions {
    path?: string;
    extension: string;
    options: CliFlags;
}

type MutableStringSignature = (options: MutableStringOptions, value: string) => string;

interface CommandHooks {
    preFileSave?: MutableStringSignature;
    preFileName?: MutableStringSignature;
}

interface CommandOption {
    type: 'string' | 'number' | 'boolean';
    short?: string;
    description?: string;
    default?: string;
    parse?: (...args: any[]) => any;
}

type CommandOptions = Record<string, CommandOption>;

export interface CommandConfig {
    title: string;
    default: string;
    path: string | MutableStringSignature;
    description?: string;
    options?: CommandOptions;
    hooks?: CommandHooks;
}

export interface CommandTemplate {
    path?: MutableStringSignature;
    template: MutableStringSignature;
}

const pkg = require('../package.json');
const commandConfigName = '.joconfig';
const configPath = join(process.cwd(), commandConfigName);
const defaultTemplatesDirectory = '.templates';
let cliConfig: CliConfig = {
    templates: [defaultTemplatesDirectory],
    logMode: 'verbose',
};
const globalOptions: CommandOptions = {
    force: {
        type: 'boolean',
        short: 'f',
        description: 'override existing files',
    },
};
const program = new Command();

program.version(pkg.version);

if (existsSync(`${configPath}.js`) || existsSync(`${configPath}.json`)) {
    const userCliConfig = require(configPath);

    cliConfig = {
        ...cliConfig,
        ...userCliConfig,
    };

    cliConfig.templates = [...cliConfig.templates.map(nodeModulePath => {
        const possibleDir = join(process.cwd(), 'node_modules', nodeModulePath, defaultTemplatesDirectory);
        return existsSync(possibleDir) ? possibleDir : join(process.cwd(), nodeModulePath);
    }), join(process.cwd(), defaultTemplatesDirectory)];
}

const createCommandOption = (optionName: string, optionConf: CommandOption) => {
    let optionPattern = optionConf.short ? `-${optionConf.short}, --${optionName}` : `--${optionName}`;

    if (optionConf.type !== 'boolean') {
        optionPattern += ` <${optionName}>`;
    }

    const args = [optionPattern];

    if (optionConf.description) args.push(optionConf.description);
    if (optionConf.default) args.push(optionConf.default);

    return args;
};

const walkers: Promise<void>[] = [];

for (const templatesRoot of cliConfig.templates) {
    const walker = walk(templatesRoot);
    walkers.push(new Promise((resolve) => walker.on('end', resolve)));

    walker.on('directory', async function (root: any, stat: WalkStats, next: WalkNext) {
        const log: string[] = [];
        const commandName = stat.name;
        const commantConfigPath = join(root, commandName, commandConfigName);
        const logIf = (predicate: boolean, ...logPayload: string[]) => {
            if (predicate) log.push(...logPayload);
        };

        if (!existsSync(`${commantConfigPath}.js`) && !existsSync(`${commantConfigPath}.json`)) {
            throw new Error(`No config provided for command ${chalk.bold(commandName)}`);
        }

        const commandConf: CommandConfig = require(commantConfigPath);
        program.addCommand(
            (() => {
                const command = new Command(commandName);

                if (commandConf.description) {
                    command.description(commandConf.description);
                }

                const availableOptions = commandConf.options ? { ...globalOptions, ...commandConf.options } : globalOptions;

                for (const [optionName, optionConf] of Object.entries(availableOptions)) {
                    // @ts-ignore unresolvable js magic
                    command.option(...createCommandOption(optionName, optionConf));
                }

                command.action(function (calledOptions: CliFlags, value?: string[]) {
                    if (!value) return;

                    logIf(cliConfig.logMode !== 'silent', '\n');

                    logIf(
                        cliConfig.logMode === 'verbose',
                        `Command: ${chalk.bold(commandName)}`,
                        `Templates: ${chalk.bold(commandConf.title)}`,
                        '\n',
                    );

                    let normalizedOptions: CliFlags;

                    if (Object.keys(calledOptions).length) {
                        logIf(
                            cliConfig.logMode === 'verbose',
                            'Options:',
                            ...Object.keys(calledOptions)
                                .map((optionName) => {
                                    let optionConf;

                                    if (commandConf.options && commandConf.options[optionName]) {
                                        optionConf = commandConf.options[optionName];
                                    }

                                    if (globalOptions[optionName]) {
                                        optionConf = globalOptions[optionName];
                                    }

                                    return optionConf ? `    --${optionName} — ${optionConf.description}` : '';
                                })
                                .filter(Boolean),
                            '\n',
                        );

                        const availableOptions = commandConf.options
                            ? { ...globalOptions, ...commandConf.options }
                            : globalOptions;

                        normalizedOptions = Object.keys(availableOptions).reduce<CliFlags>((options, optionName) => {
                            const optionConf = availableOptions[optionName];

                            options[optionName] =
                                optionConf.parse && calledOptions[optionName]
                                    ? optionConf.parse(calledOptions[optionName])
                                    : calledOptions[optionName];

                            return options;
                        }, {});
                    }

                    value.forEach((item) => {
                        braceExpansion(item).forEach(async (expansion) => {
                            const parts = expansion.split('.');
                            const fileName = parts.shift();
                            const extension = parts.join('.');

                            if (!fileName) {
                                throw new Error(`No filename provided`);
                            }

                            const normalizedFilename = commandConf.hooks?.preFileName
                                ? commandConf.hooks.preFileName({ options: normalizedOptions, extension }, fileName)
                                : fileName;
                            const normalizedExtension = extension || commandConf.default;
                            const commandTemplatePath = join(root, commandName, `${normalizedExtension}.js`);

                            if (!existsSync(commandTemplatePath)) {
                                throw new Error(`No templates provided for extension ${chalk.bold(`.${extension}`)}`);
                            }

                            const commandTemplate: CommandTemplate = require(commandTemplatePath);
                            const basePath =
                                typeof commandConf.path === 'function'
                                    ? commandConf.path({ options: normalizedOptions, extension }, normalizedFilename)
                                    : commandConf.path;
                            const createPath = join(
                                process.cwd(),
                                commandTemplate.path
                                    ? commandTemplate.path(
                                        { options: normalizedOptions, path: basePath, extension },
                                        normalizedFilename,
                                    )
                                    : basePath,
                                commandTemplate.path ? '' : `${normalizedFilename}.${normalizedExtension}`,
                            );
                            const originalFileContent = commandTemplate.template(
                                { options: normalizedOptions, path: createPath, extension },
                                normalizedFilename,
                            );
                            const fileContent = commandConf.hooks?.preFileSave
                                ? commandConf.hooks?.preFileSave(
                                    {
                                        path: createPath,
                                        options: normalizedOptions,
                                        extension,
                                    },
                                    originalFileContent,
                                )
                                : originalFileContent;
                            const logPath = `./${relative(process.cwd(), createPath)}`;

                            if (existsSync(createPath)) {
                                if (calledOptions.force) {
                                    logIf(cliConfig.logMode !== 'silent', `${chalk.yellow('o')}: ${logPath}`);

                                    await outputFile(createPath, fileContent).catch((err) => console.error(err));
                                } else {
                                    logIf(
                                        cliConfig.logMode !== 'silent',
                                        `${chalk.red('s')}: ${logPath} — ${chalk.grey('already exists')}`,
                                    );
                                }
                            } else {
                                logIf(cliConfig.logMode !== 'silent', `${chalk.green('c')}: ${logPath}`);

                                await outputFile(createPath, fileContent).catch((err) => console.error(err));
                            }
                        });
                    });

                    console.log(log.join('\n'));
                });

                return command;
            })(),
        );

        next();
    });
}

Promise.all(walkers).then(() => program.parse(process.argv));
