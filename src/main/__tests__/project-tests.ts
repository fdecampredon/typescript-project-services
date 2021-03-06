'use strict';

jest.dontMock('../project');
jest.dontMock('../utils');
jest.dontMock('../compilerManager');
jest.dontMock('./fileSystemMock');
jest.dontMock('./workingSetMock');


import ts = require('typescript');
import FileSystemMock = require('./fileSystemMock');
import WorkingSetMock = require('./workingSetMock');
import project = require('../project');
import utils = require('../utils');
import TypeScriptProject = project.TypeScriptProject;
import CompilerManager = require('../compilerManager');

interface Config {
    sources: string[];
    compilationSettings?: ts.CompilerOptions;
    compilerDirectory?: string;
}

describe('project test', function () {
    var fileSystemMock: FileSystemMock,
        workingSetMock: WorkingSetMock,
        typeScriptProject: TypeScriptProject;


    var defaultLibLocation = '/lib.d.ts';
    var defaultCompilerOptions: ts.CompilerOptions = {
        target: ts.ScriptTarget.Latest,
        module: ts.ModuleKind.None,
        noLib: false
    }
    
    function createProject(baseDir: string, config: Config, init = true) {
        CompilerManager.init(fileSystemMock, defaultLibLocation);
        var projectConfig = {
            sources: config.sources,
            compilerOptions: utils.assign({}, defaultCompilerOptions, config.compilationSettings || {}),
            compilerDirectory: config.compilerDirectory
        }
        
        typeScriptProject = project.createProject(
            baseDir,
            projectConfig,
            fileSystemMock,
            workingSetMock
        );
        
        if (init) {
            typeScriptProject.init();
        }
    };

    function expectToBeEqualArray(actual: any[], expected: any[]) {
        expect(actual.sort()).toEqual(expected.sort());
    }

    function testWorkingSetOpenCorrespondance() {
        var languageServiceHost = typeScriptProject.getLanguageServiceHost();
        Object.keys(typeScriptProject.getProjectFilesSet()).forEach(fileName => {
            expect(languageServiceHost.getScriptIsOpen(fileName)).toBe(workingSetMock.files.indexOf(fileName) !== -1);
        });
    }

    function getProjectFileContent(fileName: string) {
        return typeScriptProject.getLanguageServiceHost().getScriptContent(fileName);
    }
    
    function getProjectFiles() {
        return Object.keys(typeScriptProject.getProjectFilesSet());
    }
    
    beforeEach(function () {
        fileSystemMock = new FileSystemMock(),
        workingSetMock = new WorkingSetMock();
    });

    afterEach(function () {
        if (typeScriptProject) {
            typeScriptProject.dispose();
            typeScriptProject = null;
        }
        fileSystemMock.dispose();
    });
    
    describe('initialization', function () {

        it('should collect every files in the file system corresponding to the \'sources\' section of the given config', function () {
            fileSystemMock.setFiles({
                '/root/file1.ts': '',
                '/root/project/file2.ts': '',
                '/root/project/src/file3.ts': '',
                '/root/project/src/file4.ts': '',
                '/root/project/src/dir/file5.ts': '',
                '/root/project/src/dir/file6.other': ''
            });

            createProject('/root/project/', {
                sources: [
                    '../file1.ts',
                    'src/**/*ts'
                ]
            });
            jest.runAllTimers();

            expectToBeEqualArray(getProjectFiles(), [
                '/root/file1.ts',
                '/root/project/src/file3.ts',
                '/root/project/src/file4.ts',
                '/root/project/src/dir/file5.ts'
            ]);
        });

        it('should collect every files referenced or imported by files in the source ', function () {
            fileSystemMock.setFiles({
                '/src/file1.ts': 'import test = require("../other/file3")',
                '/src/file2.ts': '///<reference path="../other/file4.ts"/>',
                '/other/file3.ts': '///<reference path="./file5.ts"/>',
                '/other/file4.ts': '',
                '/other/file5.ts': ''
            });

            createProject('/', {
                sources: [
                    'src/**/*ts'
                ]
            });
            jest.runAllTimers();

            expectToBeEqualArray(getProjectFiles(), [
                '/src/file1.ts',
                '/src/file2.ts',
                '/other/file3.ts',
                '/other/file4.ts',
                '/other/file5.ts'
            ]);
        });

        it('should collect files added if they match the \'sources\' section of the given config', function () {
            createProject('/', {
                sources: [
                    'src/**/*ts'
                ]
            });


            fileSystemMock.addFile('/src/file1.ts', '');
            jest.runAllTimers();

            expectToBeEqualArray(getProjectFiles(), [
                '/src/file1.ts'
            ]);
        });
        
        it('should add the default library if noLib is not specified or false', function () {
            fileSystemMock.setFiles({
                '/src/file1.ts': '',
                '/lib.d.ts': ''
            });

            createProject('/', {
                sources: [
                    'src/**/*ts'
                ]
            });
            jest.runAllTimers();

            expect(typeScriptProject.getProjectFilesSet().hasOwnProperty(defaultLibLocation)).toBe(true);
        });

        it('should not add the default library if noLib is true', function () {
            fileSystemMock.setFiles({
                '/src/file1.ts': '',
                '/lib.d.ts': ''
            });

            createProject('/', {
                sources: [
                    'src/**/*ts'
                ],
                compilationSettings: {
                    noLib: true
                }
            });
            jest.runAllTimers();

            expect(typeScriptProject.getProjectFilesSet().hasOwnProperty(defaultLibLocation)).toBeFalsy();
        });
        
        
        it('should re init the project if the `typeScriptServices.js` file has changed', function () {

            fileSystemMock.setFiles({
                '/typescript/bin/typescriptServices.js' : 
                    'var ts = { ' +
                    '  createLanguageService: function () {  return { id:\'hello\', dispose : function () {}} },' +
                    '  createDocumentRegistry: function () {  return { } }' +
                    '}' ,
                
                '/lib.d.ts': ''
            });

            createProject('/', {
                sources: [
                    'src/**/*ts'
                ],
                compilerDirectory: '/typescript'
            });

            jest.runAllTimers();
            
            fileSystemMock.updateFile(
                '/typescript/bin/typescriptServices.js',
                'var ts = { ' +
                '  createLanguageService: function () {  return { id:\'newFake\', dispose : function () {}} },' +
                '  createDocumentRegistry: function () {  return { } }' +
                '}' 
            )
            
            jest.runAllTimers();

            expect((<any>typeScriptProject.getLanguageService()).id).toBe('newFake');
        });
    });
    
    describe('filesystem change handling', function () {

        it('should collect referenced files from file added ', function () {
            fileSystemMock.setFiles({
                '/other/file3.ts': '///<reference path="./file5.ts"/>',
                '/other/file4.ts': '',
                '/other/file5.ts': ''
            });
            createProject('/', {
                sources: [
                    'src/**/*ts'
                ]
            });

            fileSystemMock.addFile('/src/file1.ts', 'import test = require("../other/file3")');

            jest.runAllTimers();

            expectToBeEqualArray(getProjectFiles(), [
                '/src/file1.ts',
                '/other/file3.ts',
                '/other/file5.ts'
            ]);
        });

        it('should collect files added if they are referenced by another file ', function () {
            fileSystemMock.setFiles({
                '/src/file1.ts': 'import test = require("../other/file2")'
            });

            createProject('/', {
                sources: [
                    'src/**/*ts'
                ]
            });

            fileSystemMock.addFile('/other/file2.ts', '');
            jest.runAllTimers();

            expectToBeEqualArray(getProjectFiles(), [
                '/src/file1.ts',
                '/other/file2.ts'
            ]);
        });

        it('should remove files from project when they are deleted', function () {
            fileSystemMock.setFiles({
                '/src/file1.ts': '',
                '/src/file2.ts': ''
            });

            createProject('/', {
                sources: [
                    'src/**/*ts'
                ]
            });

            fileSystemMock.removeFile('/src/file1.ts');
            jest.runAllTimers();

            expectToBeEqualArray(getProjectFiles(), [
                '/src/file2.ts'
            ]);
        });

        it('should remove referenced files from the project when a source file referencing it is deleted', function () {
            fileSystemMock.setFiles({
                '/src/file1.ts': 'import test = require("../other/file3")',
                '/src/file2.ts': '',
                '/other/file3.ts': '///<reference path="./file5.ts"/>',
                '/other/file5.ts': ''
            });

            createProject('/', {
                sources: [
                    'src/**/*ts'
                ]
            });

            fileSystemMock.removeFile('/src/file1.ts');
            jest.runAllTimers();

            expectToBeEqualArray(getProjectFiles(), [ '/src/file2.ts'  ]);
        });

        it('should remove referenced files from the project when a source file referencing it is deleted, ' +
            'only if it is not referenced by another file', function () {
                fileSystemMock.setFiles({
                    '/src/file1.ts': 'import test = require("../other/file3")',
                    '/src/file2.ts': 'import test = require("../other/file3")',
                    '/other/file3.ts': ''
                });

                createProject('/', {
                    sources: [
                        'src/**/*ts'
                    ]
                });

                fileSystemMock.removeFile('/src/file1.ts');
                jest.runAllTimers();

                expectToBeEqualArray(getProjectFiles(), [
                    '/src/file2.ts',
                    '/other/file3.ts'
                ]);
            });

        it('should remove a referenced files from the project when deleted', function () {
            fileSystemMock.setFiles({
                '/src/file1.ts': 'import test = require("../other/file3")',
                '/src/file2.ts': 'import test = require("../other/file3")',
                '/other/file3.ts': ''
            });

            createProject('/', {
                sources: [
                    'src/**/*ts'
                ]
            });

            fileSystemMock.removeFile('/other/file3.ts');
            jest.runAllTimers();

            expectToBeEqualArray(getProjectFiles(), [
                '/src/file1.ts',
                '/src/file2.ts'
            ]);
        });

        it('recollect a referenced files from the project when deleted then readded', function () {
            fileSystemMock.setFiles({
                '/src/file1.ts': 'import test = require("../other/file3")',
                '/src/file2.ts': 'import test = require("../other/file3")',
                '/other/file3.ts': ''
            });

            createProject('/', {
                sources: [
                    'src/**/*ts'
                ]
            });

            fileSystemMock.removeFile('/other/file3.ts');
            fileSystemMock.addFile('/other/file3.ts', '');

            jest.runAllTimers();

            expectToBeEqualArray(getProjectFiles(), [
                '/src/file1.ts',
                '/src/file2.ts',
                '/other/file3.ts'
            ]);
        });

        it('should update project files when they change', function () {
            fileSystemMock.setFiles({
                '/src/file1.ts': ''
            });

            createProject('/', {
                sources: [
                    'src/**/*ts'
                ]
            });

            fileSystemMock.updateFile('/src/file1.ts', 'hello');
            jest.runAllTimers();

            expect(getProjectFileContent('/src/file1.ts')).toBe('hello');
        });
        
        it('should collect a file reference when a file change', function () {
            fileSystemMock.setFiles({
                '/src/file1.ts': '',
                '/other/file2.ts': ''
            });

            createProject('/', {
                sources: [
                    'src/**/*ts'
                ]
            });

            fileSystemMock.updateFile('/src/file1.ts', '///<reference path="../other/file2.ts"/>');
            jest.runAllTimers();

            expectToBeEqualArray(getProjectFiles(), [
                '/src/file1.ts',
                '/other/file2.ts'
            ]);
        });


        it('should remove referenced files when a file change, and does not reference them anymore', function () {
            fileSystemMock.setFiles({
                '/src/file1.ts': '///<reference path="../other/file2.ts"/>',
                '/other/file2.ts': ''
            });

            createProject('/', {
                sources: [
                    'src/**/*ts'
                ]
            });

            fileSystemMock.updateFile('/src/file1.ts', '');
            jest.runAllTimers();

            expectToBeEqualArray(getProjectFiles(), [
                '/src/file1.ts'
            ]);
        });
        
        it('should acquire a new typescript instance if a typescript path is specified', function () {

            fileSystemMock.setFiles({
                '/typescript/bin/typescriptServices.js' : 
                    'var ts = { ' +
                    '  createLanguageService: function () {  return { id:\'hello\', dispose : function () {}} },' +
                    '  createDocumentRegistry: function () {  return { } }' +
                    '}' ,
                
                '/lib.d.ts': ''
            });

            createProject('/', {
                sources: [
                    'src/**/*ts'
                ],
                compilerDirectory: '/typescript'
            });

            jest.runAllTimers();

            expect((<any>typeScriptProject.getLanguageService()).id).toBe('hello');
        });
        
    });

    describe('project update update', function () {
        beforeEach(function () {
            fileSystemMock.setFiles({
                '/src/file1.ts': 'import file3 = require(\'./file3\');',
                '/src/file2.ts': '///<reference path="./file4.ts" />',
                '/src/file3.ts': '',
                '/src/file4.ts': '',
                '/lib.d.ts': ''
            });

            createProject('/', {
                compilationSettings: {
                    target: ts.ScriptTarget.ES5
                },
                sources: [
                    'src/file1.ts'
                ]
            });
            jest.runAllTimers();
        });

        function updateProject(config: Config) {
             var projectConfig = {
                sources: config.sources,
                compilerOptions: utils.assign({}, defaultCompilerOptions, config.compilationSettings || {}),
                compilerDirectory: config.compilerDirectory
            }
            typeScriptProject.update(projectConfig);
        }

        it('should update compilerOptions if compiler options does have changed', function () {
            expect(typeScriptProject.getLanguageServiceHost().getCompilationSettings().target)
                .toBe(ts.ScriptTarget.ES5);

            updateProject({
                compilationSettings: {
                    target: ts.ScriptTarget.ES3,
                    module: ts.ModuleKind.CommonJS
                },
                sources: ['src/file1.ts']
            });
            jest.runAllTimers();


            expect(typeScriptProject.getLanguageServiceHost().getCompilationSettings().target)
                .toBe(ts.ScriptTarget.ES3);
        });

        it('should remove project files that are not included anymore in the source', function () {
            expect(typeScriptProject.getProjectFilesSet().hasOwnProperty('/src/file1.ts')).toBe(true);
            updateProject({
                compilationSettings: {
                    target: ts.ScriptTarget.ES3,
                    module: ts.ModuleKind.CommonJS
                },
                sources: []
            });

            jest.runAllTimers();


            expect(typeScriptProject.getProjectFilesSet().hasOwnProperty('/src/file1.ts')).toBeFalsy();
        });


        it('should add project files that matches the new configuration', function () {
            expect(typeScriptProject.getProjectFilesSet().hasOwnProperty('/src/file2.ts')).toBeFalsy();
            updateProject({
                compilationSettings: {
                    target: ts.ScriptTarget.ES3,
                    module: ts.ModuleKind.CommonJS
                },
                sources: [
                    'src/file2.ts'
                ]
            });

            jest.runAllTimers();


            expect(typeScriptProject.getProjectFilesSet().hasOwnProperty('/src/file2.ts')).toBe(true);
        });


        it('should remove project files that are not referenced anymore in the source', function () {
            expect(typeScriptProject.getProjectFilesSet().hasOwnProperty('/src/file3.ts')).toBe(true);
            updateProject({
                compilationSettings: {
                    target: ts.ScriptTarget.ES3,
                    module: ts.ModuleKind.CommonJS
                },
                sources: [
                    'src/file2.ts'
                ]
            });

            jest.runAllTimers();


            expect(typeScriptProject.getProjectFilesSet().hasOwnProperty('/src/file3.ts')).toBeFalsy();
        });


        it('should add project files that are now referenced by a file in the sources', function () {
            expect(typeScriptProject.getProjectFilesSet().hasOwnProperty('/src/file4.ts')).toBeFalsy();
            updateProject({
                compilationSettings: {
                    target: ts.ScriptTarget.ES3,
                    module: ts.ModuleKind.CommonJS
                },
                sources: [
                    'src/file2.ts'
                ]
            });

            jest.runAllTimers();


            expect(typeScriptProject.getProjectFilesSet().hasOwnProperty('/src/file4.ts')).toBe(true);
        });

        it('should remove default lib if the new config noLib properties is set to true', function () {
            expect(typeScriptProject.getProjectFilesSet().hasOwnProperty('/lib.d.ts')).toBe(true);
            updateProject({
                compilationSettings: {
                    target: ts.ScriptTarget.ES3,
                    module: ts.ModuleKind.CommonJS,
                    noLib: true
                },
                sources: []
            });

            jest.runAllTimers();


            expect(typeScriptProject.getProjectFilesSet().hasOwnProperty('/lib.d.ts')).toBeFalsy();
        });

        it('should mark as `open` files that have been added and that are in the working set', function () {
            expect(typeScriptProject.getProjectFilesSet().hasOwnProperty('/src/file2.ts')).toBeFalsy();
            workingSetMock.files = [
                '/src/file1.ts',
                '/src/file2.ts'
            ];

            updateProject({
                compilationSettings: {
                    target: ts.ScriptTarget.ES3,
                    module: ts.ModuleKind.CommonJS
                },
                sources: [
                    'src/file2.ts'
                ]
            });

            jest.runAllTimers();


            testWorkingSetOpenCorrespondance();
        });


        it('should reinitialize the project if compilerDirectory has changed', function () {
            var spy = spyOn(fileSystemMock, 'getProjectFiles').andCallThrough();

            updateProject({
                compilationSettings: {
                    target: ts.ScriptTarget.ES3
                },
                sources: [
                    'src/file1.ts'
                ]
            });
            
            jest.runAllTimers();

            expect(spy).toHaveBeenCalled();
        });

    });
    
    describe('getProjectFileKind', function () {
        it('should return \'SOURCE\' if the file path match the \'sources\' section of the given config', function () {
            fileSystemMock.setFiles({
                '/src/file1.ts': ''
            });

            createProject('/', {
                sources: [
                    'src/**/*ts'
                ]
            });

            jest.runAllTimers();

            expect(typeScriptProject.getProjectFileKind('/src/file1.ts')).toBe(project.ProjectFileKind.SOURCE);
        });

        it('should return \'REFERENCE\' if the file is a referenced file', function () {
            fileSystemMock.setFiles({
                '/src/file1.ts': '///<reference path="../other/file2.ts"/>',
                '/other/file2.ts': ''
            });

            createProject('/', {
                sources: [
                    'src/**/*ts'
                ]
            });

            jest.runAllTimers();

            expect(typeScriptProject.getProjectFileKind('/other/file2.ts')).toBe(project.ProjectFileKind.REFERENCE);
        });

        it('should return \'NONE\' if the file is a nor a part of the project', function () {
            fileSystemMock.setFiles({
                '/src/file1.ts': '',
                '/other/file2.ts': ''
            });

            createProject('/', {
                sources: [
                    'src/**/*ts'
                ]
            });

            jest.runAllTimers();

            expect(typeScriptProject.getProjectFileKind('/other/file2.ts')).toBe(project.ProjectFileKind.NONE);
        });

    });

    describe('working set handling', function () {
        beforeEach(function () {
            fileSystemMock.setFiles({
                '/src/file1.ts': '',
                '/src/file2.ts': '',
                '/src/file3.ts': '',
                '/src/file4.ts': '',
                '/src/file5.ts': ''
            });

            workingSetMock.files = [
                '/src/file1.ts',
                '/src/file2.ts'
            ];

            createProject('/', {
                sources: [
                    'src/**/*ts'
                ]
            });
            jest.runAllTimers();
        });

        it('should mark as \'open\' every file of the working set', function () {
            testWorkingSetOpenCorrespondance();
        });

        it('should mark as \'open\' every file added to working set', function () {
            workingSetMock.addFiles(['/src/file3.ts', '/src/file4.ts']);
            jest.runAllTimers();

            testWorkingSetOpenCorrespondance();
        });

        it('should mark as \'closed\' every file removed from the working set', function () {
            workingSetMock.removeFiles(['/src/file1.ts']);
            jest.runAllTimers();

            testWorkingSetOpenCorrespondance();
        });
    });

    describe('file edition', function () {
        beforeEach(function () {
            fileSystemMock.setFiles({
                '/src/file1.ts': ''
            });

            workingSetMock.files = [
                '/src/file1.ts'
            ];

            createProject('/', {
                sources: [
                    'src/**/*ts'
                ]
            });
        });

        it('should edit a script when a document corresponding to a project file\'s is edited', function () {
            workingSetMock.documentEdited.dispatch({
                fileName: '/src/file1.ts',
                changeList: [{
                    from: 0,
                    to: 0,
                    text: 'console.log(\'hello world\')',
                    removed: ''
                }]
            });
            jest.runAllTimers();

            expect(getProjectFileContent('/src/file1.ts')).toBe('console.log(\'hello world\')');
            workingSetMock.documentEdited.dispatch({
                fileName: '/src/file1.ts',
                changeList: [{
                    from: 8,
                    to: 11,
                    text: 'warn',
                    removed: '',
                }]
            });


            jest.runAllTimers();

            expect(getProjectFileContent('/src/file1.ts')).toBe('console.warn(\'hello world\')');
        });

        it('should set script with given document content ', function () {
            workingSetMock.documentEdited.dispatch({
                fileName: '/src/file1.ts',
                documentText: 'console.log(\'hello world\')'
            });


            jest.runAllTimers();

            expect(getProjectFileContent('/src/file1.ts')).toBe('console.log(\'hello world\')');
        });


        it('should revert a file when a document have been closed without saving', function () {
            workingSetMock.documentEdited.dispatch({
                fileName: '/src/file1.ts',
                documentText: 'console.log(\'hello world\')'
            });
            workingSetMock.removeFiles(['/src/file1.ts']);
            jest.runAllTimers();

            expect(getProjectFileContent('/src/file1.ts')).toBe('');
        });
    });
});