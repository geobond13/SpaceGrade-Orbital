import { programData as d } from '../src/data/program'
console.log({ parts: d.parts.length, requirements: d.requirements.length, tests: d.tests.length, ncrs: d.nonconformances.length, suppliers: d.suppliers.length, quotes: d.quotes.length })
console.log(d.nonconformances.map((n) => [n.id, n.detectedBy]))
