const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'mak_automation.db');
const db = new sqlite3.Database(dbPath);

// Initialize database
db.serialize(() => {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('ADMIN', 'TECHNICIAN')),
    name TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Projects table
  db.run(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projectNumber TEXT UNIQUE NOT NULL,
    projectName TEXT NOT NULL,
    projectSpec TEXT,
    customerEmail TEXT,
    specStrengthPsi TEXT,
    specAmbientTempF TEXT,
    specConcreteTempF TEXT,
    specSlump TEXT,
    specAirContentByVolume TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Work Packages table (deprecated - use tasks instead, kept for backward compatibility)
  db.run(`CREATE TABLE IF NOT EXISTS workpackages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projectId INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft', 'Assigned', 'In Progress', 'Submitted', 'Approved', 'IN_PROGRESS_TECH', 'READY_FOR_REVIEW')),
    assignedTo INTEGER,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (projectId) REFERENCES projects(id),
    FOREIGN KEY (assignedTo) REFERENCES users(id)
  )`);

  // Tasks table
  db.run(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projectId INTEGER NOT NULL,
    taskType TEXT NOT NULL CHECK(taskType IN ('DENSITY_MEASUREMENT', 'PROCTOR', 'REBAR', 'COMPRESSIVE_STRENGTH', 'CYLINDER_PICKUP')),
    status TEXT NOT NULL DEFAULT 'ASSIGNED' CHECK(status IN ('ASSIGNED', 'IN_PROGRESS_TECH', 'READY_FOR_REVIEW', 'APPROVED', 'REJECTED_NEEDS_FIX')),
    assignedTechnicianId INTEGER,
    dueDate TEXT,
    scheduledStartDate TEXT,
    scheduledEndDate TEXT,
    locationName TEXT,
    locationNotes TEXT,
    engagementNotes TEXT,
    rejectionRemarks TEXT,
    resubmissionDueDate TEXT,
    fieldCompleted INTEGER DEFAULT 0,
    fieldCompletedAt DATETIME,
    reportSubmitted INTEGER DEFAULT 0,
    lastEditedByUserId INTEGER,
    lastEditedByRole TEXT,
    lastEditedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (projectId) REFERENCES projects(id),
    FOREIGN KEY (assignedTechnicianId) REFERENCES users(id),
    FOREIGN KEY (lastEditedByUserId) REFERENCES users(id)
  )`);

  // WP1 Data table (Compressive Strength Field Report)
  // Supports both taskId (new) and workPackageId (backward compatibility)
  db.run(`CREATE TABLE IF NOT EXISTS wp1_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    taskId INTEGER UNIQUE,
    workPackageId INTEGER UNIQUE,
    
    -- Placement Information
    technician TEXT,
    weather TEXT,
    placementDate TEXT,
    specStrength TEXT,
    specStrengthDays INTEGER DEFAULT 28,
    
    -- Sample Information
    structure TEXT,
    sampleLocation TEXT,
    supplier TEXT,
    timeBatched TEXT,
    classMixId TEXT,
    timeSampled TEXT,
    yardsBatched TEXT,
    ambientTempMeasured TEXT,
    ambientTempSpecs TEXT,
    truckNo TEXT,
    ticketNo TEXT,
    concreteTempMeasured TEXT,
    concreteTempSpecs TEXT,
    plant TEXT,
    slumpMeasured TEXT,
    slumpSpecs TEXT,
    yardsPlaced TEXT,
    totalYards TEXT,
    airContentMeasured TEXT,
    airContentSpecs TEXT,
    waterAdded TEXT,
    unitWeight TEXT,
    finalCureMethod TEXT,
    
    -- Specimen Information
    specimenNo TEXT,
    specimenQty TEXT,
    specimenType TEXT,
    
    -- Cylinder data stored as JSON
    cylinders TEXT,
    
    -- Remarks
    remarks TEXT,
    
    -- Audit fields
    lastEditedByRole TEXT,
    lastEditedByName TEXT,
    lastEditedByUserId INTEGER,
    
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (taskId) REFERENCES tasks(id),
    FOREIGN KEY (workPackageId) REFERENCES workpackages(id)
  )`);
  
  // Rebar reports table
  db.run(`CREATE TABLE IF NOT EXISTS rebar_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    taskId INTEGER NOT NULL,
    clientName TEXT,
    reportDate TEXT,
    inspectionDate TEXT,
    generalContractor TEXT,
    locationDetail TEXT,
    wireMeshSpec TEXT,
    drawings TEXT,
    technicianId INTEGER,
    techName TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (taskId) REFERENCES tasks(id),
    FOREIGN KEY (technicianId) REFERENCES users(id)
  )`);

  // Notifications table
  db.run(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'info' CHECK(type IN ('info', 'success', 'warning', 'error')),
    isRead INTEGER DEFAULT 0 CHECK(isRead IN (0, 1)),
    relatedTaskId INTEGER,
    relatedWorkPackageId INTEGER,
    relatedProjectId INTEGER,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id),
    FOREIGN KEY (relatedTaskId) REFERENCES tasks(id),
    FOREIGN KEY (relatedWorkPackageId) REFERENCES workpackages(id),
    FOREIGN KEY (relatedProjectId) REFERENCES projects(id)
  )`);

  // Create default admin user if not exists
  db.get("SELECT COUNT(*) as count FROM users WHERE role = 'ADMIN'", (err, row) => {
    if (err) {
      console.error('Error checking admin:', err);
      return;
    }
    if (row.count === 0) {
      const hashedPassword = bcrypt.hashSync('admin123', 10);
      db.run(
        "INSERT INTO users (email, password, role, name) VALUES (?, ?, ?, ?)",
        ['admin@maklonestar.com', hashedPassword, 'ADMIN', 'Admin User'],
        (err) => {
          if (err) {
            console.error('Error creating admin:', err);
          } else {
            console.log('Default admin created: admin@maklonestar.com / admin123');
          }
        }
      );
    }
  });
});

module.exports = db;

