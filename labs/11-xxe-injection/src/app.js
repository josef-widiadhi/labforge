const express = require('express');
const { Pool } = require('pg');
const { XMLParser } = require('fast-xml-parser');
const swaggerUi = require('swagger-ui-express');

const app = express();
app.use(express.json());
app.use(express.text({ type: 'application/xml' }));
app.use(express.text({ type: 'text/xml' }));

const pool = new Pool({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME, port: 5432 });

const swaggerDoc = {
  openapi: '3.0.0',
  info: { title: 'Invoice API', version: '1.0.0' },
  paths: {
    '/invoice/upload': {
      post: {
        summary: 'Upload invoice as XML',
        requestBody: { content: { 'application/xml': { schema: { type: 'string' } } } },
        responses: { 200: { description: 'Parsed invoice data' } }
      }
    },
    '/invoice/validate': {
      post: { summary: 'Validate XML invoice structure', responses: { 200: { description: 'Validation result' } } }
    }
  }
};
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc));

// 🔥 VULNERABILITY: XML parser with external entity resolution enabled
const parser = new XMLParser({
  ignoreAttributes: false,
  allowBooleanAttributes: true,
  processEntities: true,     // ← enables entity processing
  htmlEntities: true,
  // External entity resolution depends on the underlying expat/libxml2
});

// For demo purposes, we use a simpler XML parsing approach that shows the concept
const parseXMLWithEntities = (xmlStr) => {
  // Simulate what a vulnerable libxml2/expat parser would do
  // Extract entity values from DOCTYPE (educational simulation)
  const entityMatch = xmlStr.match(/<!ENTITY\s+\w+\s+(?:SYSTEM\s+)?"([^"]+)"/);
  const entityName = xmlStr.match(/<!ENTITY\s+(\w+)/)?.[1];

  let processedXml = xmlStr;
  if (entityMatch && entityName) {
    const entityValue = entityMatch[1];
    let resolvedValue = entityValue;

    // Simulate file:// resolution (real XXE reads actual files)
    if (entityValue.startsWith('file://')) {
      const fs = require('fs');
      const filePath = entityValue.replace('file://', '');
      try {
        resolvedValue = fs.readFileSync(filePath, 'utf8');
      } catch (e) {
        resolvedValue = `[ERROR: ${e.message}]`;
      }
    }
    // Replace entity references
    processedXml = processedXml.replace(new RegExp(`&${entityName};`, 'g'), resolvedValue);
  }
  return parser.parse(processedXml);
};

// 🔥 VULNERABILITY: Parses user-supplied XML with entity resolution
app.post('/invoice/upload', async (req, res) => {
  const xmlData = req.body;
  try {
    const parsed = parseXMLWithEntities(xmlData);
    await pool.query(
      'INSERT INTO invoices (customer, amount, status, xml_data) VALUES ($1, $2, $3, $4)',
      [parsed?.invoice?.customer || 'unknown', parsed?.invoice?.amount || 0, 'pending', xmlData]
    );
    res.json({ message: 'Invoice processed', data: parsed });
  } catch (err) {
    res.status(500).json({ error: err.message, parsed_attempt: xmlData.substring(0, 200) });
  }
});

app.post('/invoice/validate', (req, res) => {
  const xmlData = req.body;
  try {
    const parsed = parseXMLWithEntities(xmlData);
    res.json({ valid: true, structure: Object.keys(parsed) });
  } catch (err) {
    res.json({ valid: false, error: err.message });
  }
});

app.get('/', (req, res) => res.json({
  lab: '11 - XXE (XML External Entity) Injection',
  swagger: 'http://localhost:8011/api-docs',
  hint: 'POST XML with DOCTYPE entity referencing file:///etc/passwd'
}));

app.listen(3000, () => console.log('Lab 11 running on :3000'));
