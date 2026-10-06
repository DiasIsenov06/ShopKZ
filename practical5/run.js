// Работает в Windows, macOS и Linux. Тесты сами создают временную базу.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const phase = process.argv[2] || 'after';
if (!['before', 'after'].includes(phase)) throw new Error('Фаза должна быть before или after');
const root = path.join(__dirname, '..');
const resultPath = path.join(__dirname, 'results', `${phase}-jest.json`);
fs.mkdirSync(path.dirname(resultPath), { recursive: true });
const run = spawnSync(process.execPath, [require.resolve('jest/bin/jest'),
  'tests/practical5/checkout.test.js', '--runInBand', '--json', `--outputFile=${resultPath}`], {
  cwd: root, stdio: 'inherit', env: { ...process.env,
    PRACTICAL5_REPORT_PHASE: phase, PRACTICAL5_BASELINE: phase === 'before' ? '1' : '0' }
});
if (run.error) throw run.error;
console.log(`\nРезультаты: practical5/results/${phase}-results.json`);
if (phase === 'before') console.log('В исходной версии ожидаются Failed — это воспроизведение найденных дефектов.');
process.exitCode = run.status ?? 1;
