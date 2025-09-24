const { merge } = require('lodash');

function combineSwaggerSpecs(specs) {
  // Filter out any null/undefined specs
  const validSpecs = specs.filter(spec => spec && spec.paths);
  
  if (validSpecs.length === 0) {
    throw new Error('No valid Swagger specs found');
  }

  return validSpecs.reduce((combined, current) => {
    return {
      openapi: '3.0.0',
      info: {
        title: 'HRMS API Documentation',
        version: '1.0.0',
        description: 'Documentation for all APIs'
      },
      servers: [{ url: '/api' }],
      paths: { ...(combined.paths || {}), ...(current.paths || {}) },
      components: {
        schemas: { 
          ...(combined.components?.schemas || {}), 
          ...(current.components?.schemas || {}) 
        },
        securitySchemes: { 
          ...(combined.components?.securitySchemes || {}), 
          ...(current.components?.securitySchemes || {}) 
        }
      },
      tags: [
        ...(combined.tags || []), 
        ...(current.tags || [])
      ]
    };
  }, {});
}

module.exports = { combineSwaggerSpecs };
//npm install lodash yamljs swagger-ui-express