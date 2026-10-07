import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import {
  getDB,
  getSettings,
  updateSettings,
  getMenuItems,
  saveMenuItem,
  deleteMenuItem,
  getOrders,
  createOrder,
  updateOrder,
  deleteOrder,
  clearAllOrders,
  getCustomers,
  getEmployees,
  saveEmployee,
  deleteEmployee,
  resetAllDataToDefaults,
  importBackupData,
  getDatabasePath,
  resolveDataDir,
} from './server/db.ts';
import { checkGitHubReleases, getUpdaterConfig, saveUpdaterConfig, getPackageVersion } from './server/updater.ts';

function getDistPath(): string {
  if (process.env.DIST_PATH && fs.existsSync(path.join(process.env.DIST_PATH, 'index.html'))) {
    return process.env.DIST_PATH;
  }
  if (fs.existsSync(path.join(__dirname, 'index.html'))) {
    return __dirname;
  }
  if (fs.existsSync(path.join(__dirname, 'dist', 'index.html'))) {
    return path.join(__dirname, 'dist');
  }
  const cwdDist = path.join(process.cwd(), 'dist');
  if (fs.existsSync(path.join(cwdDist, 'index.html'))) {
    return cwdDist;
  }
  return cwdDist;
}

export async function startServer(customPort?: number): Promise<{ app: express.Express; server: any; port: number }> {
  const app = express();
  const PORT = customPort || Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '10mb' }));

  // Ensure DB initializes automatically on startup
  getDB();

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', dbPath: getDatabasePath() });
  });

  // System information and database location
  app.get('/api/system/info', (req, res) => {
    const version = getPackageVersion();
    res.json({
      name: 'MALANG JAN RESTURANT',
      version,
      dbPath: getDatabasePath(),
      dataDir: resolveDataDir(),
      platform: process.platform,
      isElectron: process.env.IS_ELECTRON === 'true',
    });
  });

  // Check for updates via GitHub Releases
  app.get('/api/system/updates/check', async (req, res) => {
    const currentVersion = (req.query.currentVersion as string) || (req.query.version as string) || getPackageVersion();
    try {
      const result = await checkGitHubReleases(currentVersion);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({
        success: false,
        isUpdateAvailable: false,
        currentVersion,
        latestVersion: currentVersion,
        error: err.message,
      });
    }
  });

  // Get updater configuration
  app.get('/api/system/updates/config', (req, res) => {
    const config = getUpdaterConfig();
    res.json({
      owner: config.owner,
      repo: config.repo,
    });
  });

  // Update configuration
  app.post('/api/system/updates/config', (req, res) => {
    const { owner, repo } = req.body || {};
    const result = saveUpdaterConfig({ owner, repo });
    res.json(result);
  });

  // Bootstrap endpoint (loads all persistent SQLite state in one request)
  app.get('/api/bootstrap', (req, res) => {
    try {
      const settings = getSettings();
      const menuItems = getMenuItems();
      const orders = getOrders();
      const employees = getEmployees();
      const customers = getCustomers();
      res.json({ settings, menuItems, orders, employees, customers });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Settings endpoints
  app.get('/api/settings', (req, res) => {
    try {
      const settings = getSettings();
      res.json(settings);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/settings', (req, res) => {
    try {
      const updated = updateSettings(req.body);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Menu endpoints
  app.get('/api/menu', (req, res) => {
    try {
      const items = getMenuItems();
      res.json(items);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/menu', (req, res) => {
    try {
      const item = saveMenuItem(req.body);
      res.json(item);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/menu/:id', (req, res) => {
    try {
      deleteMenuItem(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Orders endpoints
  app.get('/api/orders', (req, res) => {
    try {
      const orders = getOrders();
      res.json(orders);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/orders', (req, res) => {
    try {
      const order = createOrder(req.body);
      res.json(order);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/orders/:id', (req, res) => {
    try {
      const updated = updateOrder(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ error: 'Order not found' });
      }
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/orders/:id', (req, res) => {
    try {
      deleteOrder(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/orders/clear-all', (req, res) => {
    try {
      clearAllOrders();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Customers endpoint
  app.get('/api/customers', (req, res) => {
    try {
      const customers = getCustomers();
      res.json(customers);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Employee endpoints
  app.get('/api/employees', (req, res) => {
    try {
      const employees = getEmployees();
      res.json(employees);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/employees', (req, res) => {
    try {
      const emp = saveEmployee(req.body);
      res.json(emp);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/employees/:id', (req, res) => {
    try {
      deleteEmployee(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Backup and Reset endpoints
  app.post('/api/backup/import', (req, res) => {
    try {
      importBackupData(req.body);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/reset-defaults', (req, res) => {
    try {
      resetAllDataToDefaults();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware for development vs static build in production
  if (process.env.NODE_ENV !== 'production' && !process.env.ELECTRON_PROD) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = getDistPath();
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
      resolve({ app, server, port: PORT });
    });
    server.on('error', (err) => {
      console.error(`Server listen error on port ${PORT}:`, err);
      reject(err);
    });
  });
}
