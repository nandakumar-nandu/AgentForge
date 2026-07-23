/**
 * Hostinger / Phusion Passenger Root Startup Entrypoint
 * This file redirects execution to the compiled backend server.
 */
require('./backend/dist/server.js');
