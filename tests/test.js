// Checks of the generators and of the wrapper, with Node:  node tests/test.js
// For every database it makes the starter model, checks it, and generates every temporalization the database has; it also
// checks the errors. The comparison of the scripts with the approved output of the Anchor repository, model by model, is
// tools/portable-check.ps1 in the sisula repository; this is what a user of the skill can run without that.
var path = require('path');
var run = require('../skills/anchor-modeling/generators/run.js');
var dir = path.join(__dirname, '..', 'skills', 'anchor-modeling', 'generators');

var failed = 0, passed = 0;
function check(name, ok, detail) {
    if (ok) { passed++; console.log('PASS  ' + name); } else { failed++; console.log('FAIL  ' + name + (detail ? ': ' + detail : '')); }
}

function load(database) { return require(path.join(dir, 'anchor-generator-' + database + '.js')); }
function call(args, files) {
    var result = { out: '', err: '', written: {} };
    result.code = run.main(args, {
        read: function (file) { if (!(file in files)) throw new Error('no file ' + file); return files[file]; },
        writeFile: function (file, text) { result.written[file] = text; },
        out: function (text) { result.out += text; },
        err: function (text) { result.err += text; }
    }, load);
    return result;
}

['sqlserver', 'snowflake', 'postgresql', 'vertica', 'bigquery', 'oracle'].forEach(function (database) {
    var generator = load(database);
    var starter = call([database, '--starter'], {});
    check(database + ': a starter model', starter.code === 0 && starter.out.indexOf('<schema ') === 0, starter.err);
    var files = { 'm.xml': starter.out };
    var checked = call([database, '--check', 'm.xml'], files);
    check(database + ': the starter passes the check', checked.code === 0 && checked.out.trim() === 'ok', checked.out);
    generator.temporalizations.forEach(function (t) {
        var made = call([database, 'm.xml', t], files);
        check(database + ' ' + t + ': a script', made.code === 0 && /CREATE/.test(made.out) && made.out.indexOf('undefined') < 0, made.err);
    });
    var broken = call([database, '--check', 'm.xml'], { 'm.xml': starter.out.replace(/ naturalKeyAttributes="[a-z]*"/, '') });
    check(database + ': a missing setting is listed', broken.code === 1 && /naturalKeyAttributes/.test(broken.out), broken.out);
    check(database + ': the same model gives the same script', generator.generate(starter.out, null) === generator.generate(starter.out, null));
});

var unknown = call(['db2', 'm.xml'], {});
check('an unknown database is exit 2', unknown.code === 2 && /sqlserver, snowflake, postgresql, vertica, bigquery, oracle/.test(unknown.err), unknown.err);
check('no arguments is exit 2 with usage', call([], {}).code === 2);

console.log(passed + ' passed, ' + failed + ' failed.');
process.exitCode = failed ? 1 : 0;
