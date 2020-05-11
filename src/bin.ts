import { join, relative } from 'path';
import { existsSync, outputFile } from 'fs-extra';
import { Command } from 'commander';
import { walk, WalkStats, WalkNext } from 'walk';
import braceExpansion from 'brace-expansion';
import chalk from 'chalk';
import deepmerge from 'deepmerge';

interface CliConfig {
    templates: string[];
    logMode: 'verbose' | 'silent' | 'short';
}

type CliFlags = Record<string, string>;

interface MutableStringOptions {
    path?: string;
    extension: string;
    options: CliFlags;
    config: CommandConfig;
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
    extends?: string;
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

const isRequirable = (p: string) => existsSync(`${p}.js`) || existsSync(`${p}.json`);
const templateModulePath = (p: string) => join(process.cwd(), 'node_modules', p);

if (isRequirable(configPath)) {
    const userCliConfig = require(configPath);

    cliConfig = {
        ...cliConfig,
        ...userCliConfig,
    };

    cliConfig.templates = [
        ...cliConfig.templates.map((nodeModulePath) => {
            const possibleDir = templateModulePath(nodeModulePath);
            return existsSync(possibleDir) ? possibleDir : join(process.cwd(), nodeModulePath);
        }),
        join(process.cwd(), defaultTemplatesDirectory),
    ];
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
        const commandConfigPath = join(root, commandName, commandConfigName);
        const logIf = (predicate: boolean, ...logPayload: string[]) => {
            if (predicate) log.push(...logPayload);
        };

        if (!isRequirable(commandConfigPath)) {
            throw new Error(`No config provided for command ${chalk.bold(commandName)}`);
        }

        const commandConf: CommandConfig = require(commandConfigPath);
        program.addCommand(
            (() => {
                const command = new Command(commandName);
                const templatesRoots: string[] = [];

                let baseCommandConf: Partial<CommandConfig> = {};

                if (commandConf.extends) {
                    const possibleModulesDir = templateModulePath(commandConf.extends);
                    const possibleRelativeDir = join(root, commandName, commandConf.extends);

                    if (existsSync(possibleModulesDir)) {
                        templatesRoots.push(possibleModulesDir);
                        baseCommandConf = require(join(possibleModulesDir, commandConfigName));
                    } else if (existsSync(possibleRelativeDir)) {
                        templatesRoots.push(possibleRelativeDir);
                        baseCommandConf = require(join(possibleRelativeDir, commandConfigName));
                    }
                }

                templatesRoots.push(join(root, commandName));

                const mergedCommandConfig = deepmerge(baseCommandConf, commandConf);

                if (mergedCommandConfig.description) {
                    command.description(mergedCommandConfig.description);
                }

                const availableOptions = mergedCommandConfig.options
                    ? { ...globalOptions, ...mergedCommandConfig.options }
                    : globalOptions;

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
                        `Templates: ${chalk.bold(mergedCommandConfig.title)}`,
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

                                    if (mergedCommandConfig.options && mergedCommandConfig.options[optionName]) {
                                        optionConf = mergedCommandConfig.options[optionName];
                                    }

                                    if (globalOptions[optionName]) {
                                        optionConf = globalOptions[optionName];
                                    }

                                    return optionConf ? `    --${optionName} — ${optionConf.description}` : '';
                                })
                                .filter(Boolean),
                            '\n',
                        );

                        const availableOptions = mergedCommandConfig.options
                            ? { ...globalOptions, ...mergedCommandConfig.options }
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

                            const normalizedFilename = mergedCommandConfig.hooks?.preFileName
                                ? mergedCommandConfig.hooks.preFileName(
                                      { options: normalizedOptions, config: mergedCommandConfig, extension },
                                      fileName,
                                  )
                                : fileName;
                            const normalizedExtension = extension || mergedCommandConfig.default;
                            const commandTemplatePaths = templatesRoots.map((r) =>
                                join(r, `${normalizedExtension}.js`),
                            );

                            let commandTemplatePath: string | null = null;
                            for (const templatePath of commandTemplatePaths) {
                                if (existsSync(templatePath)) {
                                    commandTemplatePath = templatePath;
                                }
                            }

                            if (!commandTemplatePath) {
                                throw new Error(`No templates provided for extension ${chalk.bold(`.${extension}`)}`);
                            }

                            const commandTemplate: CommandTemplate = require(commandTemplatePath);
                            const basePath =
                                typeof mergedCommandConfig.path === 'function'
                                    ? mergedCommandConfig.path(
                                          { options: normalizedOptions, config: mergedCommandConfig, extension },
                                          normalizedFilename,
                                      )
                                    : mergedCommandConfig.path;
                            const createPath = join(
                                process.cwd(),
                                commandTemplate.path
                                    ? commandTemplate.path(
                                          {
                                              options: normalizedOptions,
                                              path: basePath,
                                              extension,
                                              config: mergedCommandConfig,
                                          },
                                          normalizedFilename,
                                      )
                                    : basePath,
                                commandTemplate.path ? '' : `${normalizedFilename}.${normalizedExtension}`,
                            );
                            const originalFileContent = commandTemplate.template(
                                {
                                    options: normalizedOptions,
                                    path: createPath,
                                    config: mergedCommandConfig,
                                    extension,
                                },
                                normalizedFilename,
                            );
                            const fileContent = mergedCommandConfig.hooks?.preFileSave
                                ? mergedCommandConfig.hooks?.preFileSave(
                                      {
                                          path: createPath,
                                          options: normalizedOptions,
                                          config: mergedCommandConfig,
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
