// A command-line wrapper for the Anchor generators in this folder. Needs Node and nothing else.
//
//   node run.js <database> <model.xml> [uni|bi|crt]    the SQL script for the model, on standard output (or -o <file>)
//   node run.js <database> --check <model.xml>          what is wrong with the model, or "ok"
//   node run.js <database> --starter                    a small model for the database, to start from
//   node run.js <database> --metadata                   the <metadata .../> element of a new model
//   node run.js --list                                  the databases, and their temporalizations
//
// <database> is sqlserver, snowflake, postgresql, vertica or bigquery (any case; "postgres" and "mssql" work too).
// Exit code 0 when it worked, 1 when the model is wrong, 2 when it was used wrongly.
// Without Node, load anchor-generator-<database>.js in any ES5 engine instead (references/generator.md).

var DATABASES = ['sqlserver', 'snowflake', 'postgresql', 'vertica', 'bigquery'];
var ALIASES = { mssql: 'sqlserver', sql: 'sqlserver', postgres: 'postgresql', pg: 'postgresql', bq: 'bigquery' };
// the data type of text, which is not one of the generator's defaults: BigQuery has no varchar
var TEXT_TYPE = { bigquery: 'string(42)' };

function normalize(name) {
    var key = String(name).toLowerCase().replace(/[^a-z]/g, '');
    return ALIASES[key] || key;
}

// A small, complete model for a database: its metadata, a knot, an anchor with a historized and a knotted attribute, and an identifier.
function starter(generator) {
    var d = generator.defaults();
    var text = TEXT_TYPE[generator.target.toLowerCase()] || 'varchar(42)';
    var schema = d.encapsulation;
    return [
        '<schema format="0.101.2">',
        generator.metadataElement(),
        '<knot mnemonic="GEN" descriptor="Gender" identity="' + d.identity + '" dataRange="' + text + '">',
        '<metadata capsule="' + schema + '" generator="false"/>',
        '</knot>',
        '<anchor mnemonic="AC" descriptor="Actor" identity="' + d.identity + '">',
        '<metadata capsule="' + schema + '" generator="true"/>',
        '<attribute mnemonic="KOD" descriptor="Code" dataRange="' + text + '">',
        '<metadata capsule="' + schema + '"/>',
        '</attribute>',
        '<attribute mnemonic="NAM" descriptor="Name" timeRange="' + d.changingRange + '" dataRange="' + text + '">',
        '<metadata capsule="' + schema + '"/>',
        '</attribute>',
        '<attribute mnemonic="GEN" descriptor="Gender" knotRange="GEN">',
        '<metadata capsule="' + schema + '"/>',
        '</attribute>',
        '</anchor>',
        '</schema>',
        ''
    ].join('\n');
}

// io: { read(path) -> text, writeFile(path, text), out(text), err(text) }; load(database) -> the generator object (throws if there is none).
function main(argv, io, load) {
    var args = [], output = null, i;
    for (i = 0; i < argv.length; i++) {
        if (argv[i] === '-o' || argv[i] === '--output') { output = argv[++i]; if (!output) { io.err('-o needs a file name.\n'); return 2; } }
        else args.push(argv[i]);
    }
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        io.err('Usage: node run.js <database> <model.xml> [uni|bi|crt] [-o file]\n' +
               '       node run.js <database> --check <model.xml> | --starter | --metadata\n' +
               '       node run.js --list\n');
        return 2;
    }
    if (args[0] === '--list') {
        for (i = 0; i < DATABASES.length; i++) {
            try { var g = load(DATABASES[i]); io.out(DATABASES[i] + ': ' + g.temporalizations.join(', ') + '  (' + g.version + ')\n'); }
            catch (e) { io.out(DATABASES[i] + ': no generator file here\n'); }
        }
        return 0;
    }
    var database = normalize(args[0]), generator;
    if (DATABASES.indexOf(database) < 0) {
        io.err("No generator for '" + args[0] + "'. There is one for: " + DATABASES.join(', ') + ' (references/targets.md says what to do for other databases).\n');
        return 2;
    }
    try { generator = load(database); } catch (e) { io.err('The generator file for ' + database + ' could not be loaded: ' + (e && e.message ? e.message : e) + '\n'); return 2; }

    function emit(text) { if (output) io.writeFile(output, text); else io.out(text); }

    if (args[1] === '--starter') { emit(starter(generator)); return 0; }
    if (args[1] === '--metadata') { emit(generator.metadataElement() + '\n'); return 0; }
    if (args[1] === '--check') {
        if (!args[2]) { io.err('--check needs a model file.\n'); return 2; }
        var problem = generator.check(io.read(args[2]));
        if (problem === null) { io.out('ok\n'); return 0; }
        io.out(problem + '\n');
        return 1;
    }
    if (!args[1]) { io.err('A model file is needed.\n'); return 2; }
    var wanted = args[2] === undefined ? null : args[2];
    try { emit(generator.generate(io.read(args[1]), wanted)); }
    catch (e) { io.err((e && e.message ? e.message : String(e)) + '\n'); return 1; }
    return 0;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { main: main, starter: starter, normalize: normalize };
    if (typeof require !== 'undefined' && require.main === module) {
        var fs = require('fs'), path = require('path');
        process.exitCode = main(process.argv.slice(2), {
            read: function (file) { return fs.readFileSync(file, 'utf8'); },
            writeFile: function (file, text) { fs.writeFileSync(file, text, 'utf8'); },
            out: function (text) { process.stdout.write(text); },
            err: function (text) { process.stderr.write(text); }
        }, function (database) { return require(path.join(__dirname, 'anchor-generator-' + database + '.js')); });
    }
}
