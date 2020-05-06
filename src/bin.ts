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

type MutableStringSignature = (options: Record<string, any>, value: string) => string;

interface CommandHookProps {
    path?: string;
    options: any;
    payload: string;
}

interface CommandHooks {
    preSave?: (props: CommandHookProps) => string;
    preFilename?: (props: CommandHookProps) => string;
    prePath: (props: CommandHookProps) => string;
}

interface CommandOption {
    type: 'string' | 'number' | 'boolean';
    short?: string;
    description?: string;
    default?: string;
    parser?: (...args: any[]) => any;
}

type CommandOptions = Record<string, CommandOption>;

export interface CommandConfig {
    title: string;
    description?: string;
    default: string;
    options?: CommandOptions;
    hooks: CommandHooks;
}

export interface CommandTemplate {
    template: MutableStringSignature;
}

const pkg = require('../package.json');
const commandConfigName = '.joconfig';
const configPath = join(process.cwd(), commandConfigName);
const defaultTemplatesDirectory = '.templates';
let cliConfig: CliConfig = {
    templates: [defaultTemplatesDirectory],
    logMode: 'verbose'
};
const globalOptions: CommandOptions = {
    force: {
        type: 'boolean',
        short: 'f',
        description: 'Override existing files',
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
}

const walker = walk(cliConfig.templates[0]);

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

walker.on('directory', async function (root: any, stat: WalkStats, next: WalkNext) {
    const log: string[] = ['\n'];
    const commandName = stat.name;
    const commantConfigPath = join(process.cwd(), root, commandName, commandConfigName);

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

            command.action(function (calledOptions: any, value?: string[]) {
                if (!value) return;

                if (cliConfig.logMode === 'verbose') {
                    log.push(`Command: ${chalk.bold(commandName)}`, `Templates: ${chalk.bold(commandConf.title)}`, '\n');
                }

                let normalizedOptions = calledOptions;

                if (Object.keys(calledOptions).length) {
                    if (cliConfig.logMode === 'verbose') {
                        log.push(
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
                    }

                    const availableOptions = commandConf.options
                        ? { ...globalOptions, ...commandConf.options }
                        : globalOptions;

                    normalizedOptions = Object.keys(availableOptions).reduce<typeof availableOptions>(
                        (options, optionName) => {
                            const optionConf = availableOptions[optionName];

                            options[optionName] =
                                optionConf.parser && calledOptions[optionName]
                                    ? optionConf.parser(calledOptions[optionName])
                                    : calledOptions[optionName];

                            return options;
                        },
                        {},
                    );
                }

                value.forEach((item) => {
                    braceExpansion(item).forEach(async (expansion) => {
                        const [fileName, extension] = expansion.split('.');
                        const normalizedFilename = commandConf.hooks.preFilename
                            ? commandConf.hooks.preFilename({ payload: fileName, options: normalizedOptions })
                            : fileName;
                        const normalizedExtension = extension || commandConf.default;
                        const commandTemplatePath = join(process.cwd(), root, commandName, `${normalizedExtension}.js`);

                        if (!existsSync(commandTemplatePath)) {
                            throw new Error(`No templates provided for extension ${chalk.bold(`.${extension}`)}`);
                        }

                        const commandTemplate: CommandTemplate = require(commandTemplatePath);
                        const originalFileContent = commandTemplate.template(normalizedOptions, normalizedFilename);
                        const createPath = join(
                            process.cwd(),
                            commandConf.hooks.prePath({ payload: normalizedFilename, options: normalizedOptions }),
                            `${normalizedFilename}.${normalizedExtension}`,
                        );
                        const fileContent = commandConf.hooks.preSave
                            ? commandConf.hooks.preSave({
                                  path: createPath,
                                  payload: originalFileContent,
                                  options: normalizedOptions,
                              })
                            : originalFileContent;
                        const logPath = `./${relative(process.cwd(), createPath)}`;
                        const ex = existsSync(createPath);

                        if (ex) {
                            if (calledOptions.force) {
                                log.push(`${chalk.yellow('o')}: ${logPath}`);

                                await outputFile(createPath, fileContent).catch((err) => console.error(err));
                            } else {
                                log.push(
                                    `${chalk.red('s')}: ${logPath} — ${chalk.grey('already exists')}`,
                                );
                            }
                        } else {
                            log.push(`${chalk.green('c')}: ${logPath}`);

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

walker.on('end', () => program.parse(process.argv));
