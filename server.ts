import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import nodemailer from 'nodemailer';
import { GoogleGenAI } from '@google/genai';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });

dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: false });

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DB_FILE = path.join(process.cwd(), 'db.json');

// Body parsing parameters
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ==========================================
// MONGODB CONNECTION & SCHEMAS SETUP
// ==========================================

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://microsoftstudentsocietyuemk_db_user:WueN69emGDPhuQ@cluster0.nhzbfpl.mongodb.net/?appName=Cluster0";

// Disable buffering globally so that queries fail instantly (within ms) if disconnected,
// allowing us to immediately activate the local files fallback instead of stalling the client for 10 seconds.
mongoose.set('bufferCommands', false);

let isMongoConnected = false;

mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 30000, // Timeout after 4s (fail-fast) if unable to ping MongoDB Cloud
  socketTimeoutMS: 30000,
})
  .then(() => {
    isMongoConnected = true;
    console.log("[MongoDB Manager] Connected successfully to Cluster0 database!");
    seedDatabaseFromLocalJSON();
  })
  .catch((err) => {
    isMongoConnected = false;
    console.warn("[MongoDB Manager Warning] Database connection failure. Operating with high-reliability local filesystem fallback.", err.message);
  });

// Setup event listeners for connection status
mongoose.connection.on('connected', () => {
  isMongoConnected = true;
  console.log("[MongoDB EVENT] CONNECTED");
});

mongoose.connection.on('disconnected', () => {
  isMongoConnected = false;
  console.log("[MongoDB EVENT] DISCONNECTED");
});

mongoose.connection.on('error', (err) => {
  isMongoConnected = false;
  console.error("[MongoDB EVENT] ERROR:", err);
});

// Schema definitions
const TeamMemberSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  title: { type: String, required: true },
  category: { type: String, required: true },
  photoUrl: { type: String, required: true },
  linkedinUrl: { type: String },
  instagramUrl: { type: String },
  sortOrder: { type: Number, default: 1 },
  isBestMember: { type: Boolean, default: false },
  memberId: { type: String },
  campus: { type: String },
  year: { type: String },
  enrollmentNumber: { type: String },
  department: { type: String },
  phone: { type: String },
  domain: { type: String }
});

const EventItemSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String },
  date: { type: String },
  time: { type: String },
  venue: { type: String },
  logoUrl: { type: String },
  details: { type: String },
  registrationLink: { type: String },
  isUpcoming: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 1 }
});

const GalleryItemSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  photoUrl: { type: String, required: true },
  description: { type: String },
  sortOrder: { type: Number, default: 1 }
});

const ProjectSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  description: { type: String },
  image: { type: String },
  techStack: [{ type: String }],
  githubUrl: { type: String },
  liveUrl: { type: String },
  sortOrder: { type: Number, default: 1 }
});

const JoinRequestSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String },
  year: { type: String },
  department: { type: String },
  domain: { type: String },
  reason: { type: String },
  submittedAt: { type: String, default: () => new Date().toISOString() },
  campus: { type: String },
  enrollmentNumber: { type: String },
  status: { type: String, default: 'pending' }, // 'pending' | 'interview_scheduled' | 'selected' | 'rejected'
  interviewMeetLink: { type: String },
  interviewDateTime: { type: String },
  interviewNote: { type: String },
  decidedAt: { type: String },
  banExpiresAt: { type: String },
  aiGeneratedText: { type: String }
});

const ContactMessageSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  subject: { type: String },
  message: { type: String },
  submittedAt: { type: String, default: () => new Date().toISOString() },
  replyText: { type: String },
  repliedAt: { type: String }
});

const TaskSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  assignedToMemberId: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String },
  deadline: { type: String },
  status: { type: String, default: 'assigned' }, // 'assigned' | 'pending_verification' | 'completed'
  submissionNotes: { type: String, default: '' },
  submissionLink: { type: String, default: '' },
  submittedAt: { type: String }
});

const PendingMemberSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  title: { type: String },
  category: { type: String },
  photoUrl: { type: String },
  linkedinUrl: { type: String },
  instagramUrl: { type: String },
  sortOrder: { type: Number },
  submittedAt: { type: String, default: () => new Date().toISOString() }
});

// Mongoose Models
const TeamMemberModel = mongoose.model('TeamMember', TeamMemberSchema);
const EventItemModel = mongoose.model('EventItem', EventItemSchema);
const GalleryItemModel = mongoose.model('GalleryItem', GalleryItemSchema);
const ProjectModel = mongoose.model('Project', ProjectSchema);
const JoinRequestModel = mongoose.model('JoinRequest', JoinRequestSchema);
const ContactMessageModel = mongoose.model('ContactMessage', ContactMessageSchema);
const TaskModel = mongoose.model('Task', TaskSchema);
const PendingMemberModel = mongoose.model('PendingMember', PendingMemberSchema);

// Portal Configuration Settings
const SettingsSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  iemLogo: { type: String, default: '/iem.jpg' },
  uemLogo: { type: String, default: '/uem.jpg' },
  mssLogo: { type: String, default: '/mss.jpg' },
  instagramUrl: { type: String, default: 'https://www.instagram.com/msa.uemk/' },
  linkedinUrl: { type: String, default: 'https://in.linkedin.com/company/microsoft-student-society-uemk' },
  facebookUrl: { type: String, default: 'https://facebook.com' },
  whatsappUrl: { type: String, default: 'https://whatsapp.com' },
});
const SettingsModel = mongoose.model('Settings', SettingsSchema);

// Admin Notification Logs
const AdminNotificationSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  message: { type: String, required: true },
  type: { type: String, default: 'info' },
  createdAt: { type: String, default: () => new Date().toISOString() }
});
const AdminNotificationModel = mongoose.model('AdminNotification', AdminNotificationSchema);

// ==========================================
// HIGH-RELIABILITY LOCAL FILE SYSTEM DATABASE CONTROLLER
// ==========================================

interface LocalData {
  team: any[];
  events: any[];
  gallery: any[];
  projects: any[];
  joinRequests: any[];
  contactMessages: any[];
  tasks: any[];
  pendingMembers: any[];
  notifications?: any[];
  settings?: any;
}

function getInitialTeamMembers() {
  return [
    {
      id: "team_faculty_1",
      name: "Prof. Dr. Abhishek Bhattacharya",
      email: "abhishek.b@mss.org",
      title: "Faculty Advisor & CSE Department Head",
      category: "faculty_advisory",
      photoUrl: "https://images.unsplash.com/photo-1540569014015-19a7be504e3a?auto=format&fit=crop&q=80&w=300",
      linkedinUrl: "https://linkedin.com",
      instagramUrl: "",
      sortOrder: 1,
      isBestMember: false
    },
    {
      id: "team_exec_1",
      name: "Sayak Sg",
      email: "sayak.sg@mss.org",
      title: "Student Chairperson",
      category: "executive_board",
      photoUrl: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&q=80&w=300",
      linkedinUrl: "https://linkedin.com",
      instagramUrl: "",
      sortOrder: 1,
      isBestMember: false
    },
    {
      id: "team_exec_2",
      name: "Ananya Sen",
      email: "ananya.s@mss.org",
      title: "Vice Chairperson & Operations Lead",
      category: "executive_board",
      photoUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=300",
      linkedinUrl: "https://linkedin.com",
      instagramUrl: "",
      sortOrder: 2,
      isBestMember: false
    },
    {
      id: "team_leads_1",
      name: "Rahul Dev",
      email: "rahul.d@mss.org",
      title: "Technical Lead & Cloud Specialist",
      category: "session_leads",
      photoUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=300",
      linkedinUrl: "https://linkedin.com",
      instagramUrl: "",
      sortOrder: 1,
      isBestMember: false
    },
    {
      id: "team_member_1",
      name: "Siddharth Roy",
      email: "siddharth.r@mss.org",
      title: "Active Executive & DevOps Engineer",
      category: "student_member",
      photoUrl: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=300",
      linkedinUrl: "https://linkedin.com",
      instagramUrl: "",
      sortOrder: 1,
      isBestMember: true // Confers award badge on active roster
    }
  ];
}

function getInitialEvents() {
  return [
    {
      id: "event_azure_intro",
      name: "Microsoft Azure Cloud Foundations",
      description: "Get started with Cloud Computing, Azure Virtual Machines, Storage accounts, and Container services.",
      date: "2026-06-15",
      time: "14:00 - 17:00 IST",
      venue: "Main Auditorium, UEM Kolkata",
      logoUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=600",
      details: "An immersive hands-on session led by core technical student leads guiding you through deploying active web service architectures.",
      registrationLink: "https://forms.office.com",
      isUpcoming: true,
      sortOrder: 1
    },
    {
      id: "event_ai_workshop",
      name: "Generative AI Hackathon with Gemini APIs",
      description: "Build cutting-edge full-stack web solutions powered by Gemini 1.5 Pro and Flash AI models.",
      date: "2026-05-10",
      time: "10:00 - 18:00 IST",
      venue: "Big Data Research Laboratory",
      logoUrl: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&q=80&w=600",
      details: "A standard coding hackathon sponsored by Microsoft Student Society chapters focused on solving local social problems using AI tools.",
      registrationLink: "https://github.com",
      isUpcoming: false,
      sortOrder: 2
    }
  ];
}

function getInitialGalleryItems() {
  return [
    {
      id: "gallery_1",
      title: "Inaugural Chapter Keynote Session",
      photoUrl: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&q=80&w=800",
      description: "The official launch of Microsoft Student Society UEMK Chapter in the main campus hall.",
      sortOrder: 1
    },
    {
      id: "gallery_2",
      title: "Hands-on Cloud Workshop Lab",
      photoUrl: "https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&q=80&w=800",
      description: "Students collaborating on cloud orchestration during our first Azure lab session.",
      sortOrder: 2
    }
  ];
}

function getInitialProjects() {
  return [
    {
      id: "project_1",
      title: "Smart Campus Advisory Assistant",
      description: "A comprehensive AI assistant providing quick links, curriculum maps, and room directions using Gemini models.",
      image: "https://images.unsplash.com/photo-1531297484001-80022131f5a1?auto=format&fit=crop&q=80&w=600",
      techStack: ["React", "Typescript", "Express", "Gemini API"],
      githubUrl: "https://github.com",
      liveUrl: "https://example.com",
      sortOrder: 1
    },
    {
      id: "project_2",
      title: "Cloud-native Attendance & Identity Engine",
      description: "Automated, fast classroom attendance log using Azure cognitive services in deep neural nets.",
      image: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&q=80&w=600",
      techStack: ["React", "Azure Services", "Node.js", "MongoDB"],
      githubUrl: "https://github.com",
      liveUrl: "https://example.com",
      sortOrder: 2
    }
  ];
}

function getLocalData(): LocalData {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        team: Array.isArray(parsed.team) ? parsed.team : getInitialTeamMembers(),
        events: Array.isArray(parsed.events) ? parsed.events : getInitialEvents(),
        gallery: Array.isArray(parsed.gallery) ? parsed.gallery : getInitialGalleryItems(),
        projects: Array.isArray(parsed.projects) ? parsed.projects : getInitialProjects(),
        joinRequests: Array.isArray(parsed.joinRequests) ? parsed.joinRequests : [],
        contactMessages: Array.isArray(parsed.contactMessages) ? parsed.contactMessages : [],
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
        pendingMembers: Array.isArray(parsed.pendingMembers) ? parsed.pendingMembers : [],
        notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
        settings: parsed.settings || {
          iemLogo: '/iem.jpg',
          uemLogo: '/uem.jpg',
          mssLogo: '/mss.jpg',
          instagramUrl: 'https://www.instagram.com/msa.uemk/',
          linkedinUrl: 'https://in.linkedin.com/company/microsoft-student-society-uemk',
          facebookUrl: 'https://facebook.com',
          whatsappUrl: 'https://whatsapp.com'
        }
      };
    }
  } catch (err) {
    console.error("[Local DB Error] Failed to read or parse local database file:", err);
  }

  // Create clean initial file structure if it doesn't exist
  const initial: LocalData = {
    team: getInitialTeamMembers(),
    events: getInitialEvents(),
    gallery: getInitialGalleryItems(),
    projects: getInitialProjects(),
    joinRequests: [],
    contactMessages: [],
    tasks: [],
    pendingMembers: [],
    notifications: [],
    settings: {
      iemLogo: '/iem.jpg',
      uemLogo: '/uem.jpg',
      mssLogo: '/mss.jpg',
      instagramUrl: 'https://www.instagram.com/msa.uemk/',
      linkedinUrl: 'https://in.linkedin.com/company/microsoft-student-society-uemk',
      facebookUrl: 'https://facebook.com',
      whatsappUrl: 'https://whatsapp.com'
    }
  };
  saveLocalData(initial);
  return initial;
}

function saveLocalData(data: LocalData) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error("[Local DB Error] Failed to write local database file:", err);
  }
}

// Helper to create and persist admin notifications
async function createAdminNotification(message: string, type: string = 'info') {
  try {
    const localData = getLocalData();
    const notif = {
      id: 'notif_' + Math.random().toString(36).substr(2, 9),
      message,
      type,
      createdAt: new Date().toISOString()
    };
    
    if (!Array.isArray(localData.notifications)) {
      localData.notifications = [];
    }
    localData.notifications.unshift(notif);
    saveLocalData(localData);

    await runDbQuery(
      async () => {
        await new AdminNotificationModel(notif).save();
      },
      () => {}
    );
  } catch (err) {
    console.error("Failed creating admin notification:", err);
  }
}

/**
 * Universal safe query block handler.
 * If MongoDB is not connected (readyState != 1) or individual queries throw time-outs or socket failures,
 * it runs the localFallback immediately with zero network lag.
 */
async function runDbQuery<T>(
  mongoFunc: () => Promise<T>,
  localFallback: () => T | Promise<T>
): Promise<T> {

  console.log(
    "[DB DEBUG]",
    "isMongoConnected =", isMongoConnected,
    "readyState =", mongoose.connection.readyState
  );

  if (!isMongoConnected || mongoose.connection.readyState !== 1) {
    console.log("[DB DEBUG] USING LOCAL FALLBACK");
    return Promise.resolve(localFallback());
  }


  try {
    console.log("[DB DEBUG] USING MONGODB");
    return await mongoFunc();
  } catch (err: any) {
    console.warn(
      "[Database Manager Warning] Query failed. Falling back to local db.json. Error:",
      err.message
    );

    console.log("[DB DEBUG] MONGO QUERY FAILED -> LOCAL FALLBACK");

    return Promise.resolve(localFallback());
  }
}

// Seeding engine to upload whatever has been done up to now from db.json into MongoDB
async function seedDatabaseFromLocalJSON() {
  try {
    const memberCount = await TeamMemberModel.countDocuments();
    if (memberCount === 0) {
      console.log("[MongoDB Seeder] Target MongoDB database in Cluster0 is empty. Initiating seeding...");
      
      let localData: any = {};
      if (fs.existsSync(DB_FILE)) {
        try {
          const raw = fs.readFileSync(DB_FILE, 'utf-8');
          localData = JSON.parse(raw);
          console.log("[MongoDB Seeder] Parsed local db.json successfully.");
        } catch (e) {
          console.error("[MongoDB Seeder Error] Failed to read or parse local db.json file:", e);
        }
      }

      if (!localData.team) {
        localData = getLocalData();
      }

      if (localData.team && localData.team.length > 0) {
        // Strip out memberId to let Mongoose schema generate/import cleanly
        const filteredTeam = localData.team.map((m: any) => {
          const { memberId, ...rest } = m;
          return rest;
        });
        await TeamMemberModel.insertMany(filteredTeam);
        console.log(`[MongoDB Seeder] Seeded ${filteredTeam.length} active team members.`);
      }

      if (localData.events && localData.events.length > 0) {
        await EventItemModel.insertMany(localData.events);
        console.log(`[MongoDB Seeder] Seeded ${localData.events.length} events.`);
      }

      if (localData.gallery && localData.gallery.length > 0) {
        await GalleryItemModel.insertMany(localData.gallery);
        console.log(`[MongoDB Seeder] Seeded ${localData.gallery.length} gallery items.`);
      }

      if (localData.projects && localData.projects.length > 0) {
        await ProjectModel.insertMany(localData.projects);
        console.log(`[MongoDB Seeder] Seeded ${localData.projects.length} projects.`);
      }

      if (localData.joinRequests && localData.joinRequests.length > 0) {
        await JoinRequestModel.insertMany(localData.joinRequests);
        console.log(`[MongoDB Seeder] Seeded ${localData.joinRequests.length} join requests.`);
      }

      if (localData.contactMessages && localData.contactMessages.length > 0) {
        await ContactMessageModel.insertMany(localData.contactMessages);
        console.log(`[MongoDB Seeder] Seeded ${localData.contactMessages.length} contact messages.`);
      }

      if (localData.tasks && localData.tasks.length > 0) {
        await TaskModel.insertMany(localData.tasks);
        console.log(`[MongoDB Seeder] Seeded ${localData.tasks.length} tasks.`);
      }

      if (localData.pendingMembers && localData.pendingMembers.length > 0) {
        await PendingMemberModel.insertMany(localData.pendingMembers);
        console.log(`[MongoDB Seeder] Seeded ${localData.pendingMembers.length} pending member signup requests.`);
      }

      console.log("[MongoDB Seeder] Migration and database upload complete!");
    } else {
      console.log("[MongoDB Seeder] Database contains existing team records. Seeding pipeline skipped.");
    }
  } catch (err) {
    console.error("[MongoDB Seeder Error] Disaster occurred during seeding operation:", err);
  }
}

// ==========================================
// SMTP TRANSACTIONAL EMAIL CONTROLLER
// ==========================================

const createSMTPTransporter = () => {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = port === 465;
  
  const smtpUser = (process.env.SMTP_USER && process.env.SMTP_USER.trim()) || 'microsoftstudentsocietyuemk@gmail.com';
  const smtpPass = (process.env.SMTP_PASS && process.env.SMTP_PASS.trim()) || 'nwujlixabysxgjoi';

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: smtpUser,
      pass: smtpPass
    },
    tls: {
      rejectUnauthorized: false
    },
    connectionTimeout: 2000, // Fail fast if unreachable (2s)
    greetingTimeout: 2000,   // Fail fast if slow greeting (2s)
    socketTimeout: 3000      // Fail fast on slow socket read (3s)
  });
};

const sendEmail = async (to: string, subject: string, htmlContent: string) => {
  try {
    const transporter = createSMTPTransporter();
    const fromAddress = process.env.SMTP_FROM || '"Microsoft Student Society UEMK" <microsoftstudentsocietyuemk@gmail.com>';
    
    const info = await transporter.sendMail({
      from: fromAddress,
      to,
      subject,
      html: htmlContent
    });
    console.log(`[SMTP Mailer Service] Transactional email sent successfully to ${to}. Message ID: ${info.messageId}`);
    return true;
  } catch (error: any) {
    console.error(`[SMTP Mailer Service Error] Failed to delegate mail to ${to}:`, error);
    console.error(`[SMTP Connection Diagnostic Logs] SMTP_HOST: ${process.env.SMTP_HOST || 'smtp.gmail.com'}, SMTP_PORT: ${process.env.SMTP_PORT || 587}, SMTP_USER: ${process.env.SMTP_USER || 'microsoftstudentsocietyuemk@gmail.com'}`);
    return false;
  }
};

// ==========================================
// DYNAMIC SEQUENCE IDENTITY ASSIGNMENT HELPERS
// ==========================================

function assignMemberSequencesForArray(team: any[]) {
  if (!Array.isArray(team)) return;
  const getCode = (cat: string, name: string) => {
    switch (cat) {
      case 'faculty_advisory':
        return 'FA';
      case 'executive_board':
        const lowerName = name.toLowerCase();
        if (lowerName.includes('chairperson') || lowerName.includes('chair')) return 'CP';
        return 'EB';
      case 'session_leads':
        return 'SL';
      case 'student_member':
        return 'MB';
      case 'student_alumni':
        return 'AL';
      default:
        return 'MB';
    }
  };

  const groups: { [key: string]: any[] } = {};
  
  team.forEach((member: any) => {
    const code = getCode(member.category, member.title || '');
    if (!groups[code]) groups[code] = [];
    groups[code].push(member);
  });

  Object.keys(groups).forEach((code) => {
    const list = groups[code];
    list.sort((a, b) => (Number(a.sortOrder) || 999) - (Number(b.sortOrder) || 999));
    list.forEach((member, index) => {
      member.memberId = `${code}-${index + 1}`;
      if (!member.email) {
        const prefix = member.name.toLowerCase().split(' ')[0].replace(/[^a-z0-9]/g, '');
        member.email = `${prefix || 'member'}@mss.org`;
      }
    });
  });
}

// ==========================================
// SECURITY ACCESS & PERMISSIONS MIDDLEWARE
// ==========================================

function checkAdminAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader === 'Bearer mss-admin-token-xyz-123') {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized. System administrator console keys required.' });
  }
}

// ==========================================
// ROOT ENDPOINT & HEALTH CHECK
// ==========================================
app.get('/', (req, res) => {
  res.json({
    service: 'MLSA MSS UEMK Backend API',
    status: 'operational',
    version: '1.0.0',
    endpoints: {
      data: '/api/data',
      settings: '/api/settings',
      team: '/api/team',
      events: '/api/events',
      gallery: '/api/gallery',
      projects: '/api/projects',
      contact: '/api/contact',
      join: '/api/join'
    }
  });
});

// Portal settings API endpoints
app.get('/api/settings', async (req, res) => {
  try {
    const localData = getLocalData();
    const settings = await runDbQuery(
      async () => {
        const doc = await SettingsModel.findOne({ key: 'global' }).lean();
        return doc || null;
      },
      () => null
    );

    const mergedSettings = settings || localData.settings || {
      iemLogo: '/iem.jpg',
      uemLogo: '/uem.jpg',
      mssLogo: '/mss.jpg',
      instagramUrl: 'https://www.instagram.com/msa.uemk/',
      linkedinUrl: 'https://in.linkedin.com/company/microsoft-student-society-uemk',
      facebookUrl: 'https://facebook.com',
      whatsappUrl: 'https://whatsapp.com'
    };
    
    // Auto-sync back to localData if missing
    if (settings && (!localData.settings || JSON.stringify(localData.settings) !== JSON.stringify(settings))) {
        localData.settings = settings;
        saveLocalData(localData);
    }
    
    res.json(mergedSettings);
  } catch (err) {
    res.status(500).json({ error: 'Failed loading active portal settings.' });
  }
});

app.put('/api/settings', checkAdminAuth, async (req, res) => {
  try {
    const localData = getLocalData();
    const updated = {
      iemLogo: req.body.iemLogo || localData.settings?.iemLogo || '/iem.jpg',
      uemLogo: req.body.uemLogo || localData.settings?.uemLogo || '/uem.jpg',
      mssLogo: req.body.mssLogo || localData.settings?.mssLogo || '/mss.jpg',
      instagramUrl: req.body.instagramUrl || localData.settings?.instagramUrl || 'https://www.instagram.com/msa.uemk/',
      linkedinUrl: req.body.linkedinUrl || localData.settings?.linkedinUrl || 'https://in.linkedin.com/company/microsoft-student-society-uemk',
      facebookUrl: req.body.facebookUrl || localData.settings?.facebookUrl || 'https://facebook.com',
      whatsappUrl: req.body.whatsappUrl || localData.settings?.whatsappUrl || 'https://whatsapp.com'
    };
    
    localData.settings = updated;
    saveLocalData(localData);

    await runDbQuery(
      async () => {
        await SettingsModel.findOneAndUpdate(
          { key: 'global' },
          { $set: updated },
          { upsert: true, new: true }
        );
      },
      () => {}
    );
    
    res.json({ success: true, message: 'Settings and operational media synchronized successfully.', settings: updated });
  } catch (err: any) {
    res.status(500).json({ error: 'Settings update failed: ' + err.message });
  }
});

// Admin Notification endpoints
app.get('/api/admin/notifications', checkAdminAuth, (req, res) => {
  try {
    const localData = getLocalData();
    res.json(localData.notifications || []);
  } catch (err) {
    res.status(500).json({ error: 'Failed retrieving notifications' });
  }
});

app.delete('/api/admin/notifications', checkAdminAuth, async (req, res) => {
  try {
    const localData = getLocalData();
    localData.notifications = [];
    saveLocalData(localData);
    
    await runDbQuery(
      async () => {
        await AdminNotificationModel.deleteMany({});
      },
      () => {}
    );
    
    res.json({ success: true, message: 'All notifications cleared successfully!' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed clearing notifications: ' + err.message });
  }
});

// ==========================================
// MONGODB BACKED EXPRESS API ENDPOINTS

// --- PROJECTS ---
app.post('/api/projects', checkAdminAuth, async (req, res) => {
  try {
    const localData = getLocalData();
    const newProject = {
      id: 'proj_' + Math.random().toString(36).substr(2, 9),
      title: req.body.title,
      description: req.body.description,
      githubUrl: req.body.githubUrl || '',
      liveUrl: req.body.liveUrl || '',
      techStack: Array.isArray(req.body.techStack) ? req.body.techStack : (req.body.techStack ? req.body.techStack.split(',').map((s: string) => s.trim()) : []),
      image: req.body.image || 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&q=80',
      sortOrder: req.body.sortOrder || (localData.projects ? localData.projects.length + 1 : 1)
    };

    if (!localData.projects) localData.projects = [];
    localData.projects.push(newProject);
    saveLocalData(localData);

    await runDbQuery(
      async () => {
        await new ProjectModel(newProject).save();
      },
      () => {}
    );
    
    await createAdminNotification(`Admin provisioned new project log: ${newProject.title}`, 'project_management');
    res.json(newProject);
  } catch (err) {
    res.status(500).json({ error: 'Failed inserting project record into active directory.' });
  }
});

app.put('/api/projects/:id', checkAdminAuth, async (req, res) => {
  try {
    const localData = getLocalData();
    if (!localData.projects) localData.projects = [];
    const index = localData.projects.findIndex((p) => String(p.id) === req.params.id || String(p._id) === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Project record not indexed.' });
    }

    const o = localData.projects[index];
    const updated = { ...o };
    if (req.body.title !== undefined) updated.title = req.body.title;
    if (req.body.description !== undefined) updated.description = req.body.description;
    if (req.body.githubUrl !== undefined) updated.githubUrl = req.body.githubUrl;
    if (req.body.liveUrl !== undefined) updated.liveUrl = req.body.liveUrl;
    if (req.body.techStack !== undefined) updated.techStack = Array.isArray(req.body.techStack) ? req.body.techStack : req.body.techStack.split(',').map((s: string) => s.trim());
    if (req.body.image !== undefined) updated.image = req.body.image;
    if (req.body.sortOrder !== undefined) updated.sortOrder = req.body.sortOrder;

    localData.projects[index] = updated;
    saveLocalData(localData);

    await runDbQuery(
      async () => {
        await ProjectModel.findOneAndUpdate(
          { id: req.params.id },
          { $set: updated },
          { new: true }
        );
      },
      () => {}
    );

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Database pipeline failed updating project matrix.' });
  }
});

app.delete('/api/projects/:id', checkAdminAuth, async (req, res) => {
  try {
    const localData = getLocalData();
    if (!localData.projects) localData.projects = [];
    const index = localData.projects.findIndex((p) => String(p.id) === req.params.id || String(p._id) === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Project not located in cluster.' });
    }

    localData.projects.splice(index, 1);
    saveLocalData(localData);

    await runDbQuery(
      async () => {
        await ProjectModel.deleteMany({ $or: [{ id: req.params.id }, ...(mongoose.Types.ObjectId.isValid(req.params.id) ? [{ _id: req.params.id }] : [])] });
      },
      () => {}
    );

    res.json({ success: true, message: 'Project removed from database context.' });
  } catch (err) {
    res.status(500).json({ error: 'Purge failed on active directory project scope.' });
  }
});

// 1. Get entire state (including team, events, gallery, projects, tasks, applicants)
app.get('/api/data', async (req, res) => {
  try {
    const data = await runDbQuery(
      async () => {
        const teamDocs = await TeamMemberModel.find().lean();
        const eventDocs = await EventItemModel.find().lean();
        const galleryDocs = await GalleryItemModel.find().lean();
        const projectDocs = await ProjectModel.find().lean();
        const joinDocs = await JoinRequestModel.find().lean();
        const contactDocs = await ContactMessageModel.find().lean();
        const taskDocs = await TaskModel.find().lean();
        const pendingDocs = await PendingMemberModel.find().lean();

        const state = {
          team: teamDocs.map((doc: any) => ({ ...doc, id: doc.id || (doc._id ? String(doc._id) : '') })),
          events: eventDocs.map((doc: any) => ({ ...doc, id: doc.id || (doc._id ? String(doc._id) : '') })).sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0)),
          gallery: galleryDocs.map((doc: any) => ({ ...doc, id: doc.id || (doc._id ? String(doc._id) : '') })).sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0)),
          projects: projectDocs.map((doc: any) => ({ ...doc, id: doc.id || (doc._id ? String(doc._id) : '') })).sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0)),
          joinRequests: joinDocs.map((doc: any) => ({ ...doc, id: doc.id || (doc._id ? String(doc._id) : '') })),
          contactMessages: contactDocs.map((doc: any) => ({ ...doc, id: doc.id || (doc._id ? String(doc._id) : '') })),
          tasks: taskDocs.map((doc: any) => ({ ...doc, id: doc.id || (doc._id ? String(doc._id) : '') })),
          pendingMembers: pendingDocs.map((doc: any) => ({ ...doc, id: doc.id || (doc._id ? String(doc._id) : '') }))
        };

        // Keep the Mongo-backed API response stable. Avoid rewriting db.json on every fetch,
        // because Vite watches that file and causes rapid reload loops in development.
        console.log(
  "[API DATA]",
  "Mongo Join Requests:",
  joinDocs.length,
  "Mongo Team:",
  teamDocs.length
);
        return state;
      },
      () => {
        return getLocalData();
      }
    );

    // Filter out rejected candidates from the UI state so that they don't clutter the admin console applicants stack,
    // while keeping them in storage to enforce the 30-day cooling-off block
    data.joinRequests = (data.joinRequests || []).filter((reqItem: any) => {
      return reqItem.status !== 'rejected';
    });

    // Inject sequential identification codes
    assignMemberSequencesForArray(data.team);

    res.json(data);
  } catch (err: any) {
    console.error("[API Error] State retrieve collapse error:", err);
    res.status(500).json({ error: 'Failed to synchronize with localized database engine.' });
  }
});

// 2. Administrator credentials verification 
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (email === 'microsoftstudentsocietyuemk@gmail.com' && password === 'WueN69emGDPhuQ') {
    res.json({ success: true, token: 'mss-admin-token-xyz-123' });

    // SMTP Action: Notify admin that access keys were authenticated
    const mailSubject = `[MSS UEMK Portal] Alert: Administrator Logon Recorded`;
    const mailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #fda4af; border-radius: 12px; background-color: #fff1f2;">
        <h2 style="color: #be123c; margin-bottom: 12px; font-weight: 900;">🚨 SYSTEM ACCESS NOTIFICATION</h2>
        <p style="font-size: 14px; color: #4c0519; line-height: 1.5;">An authorized administrative session keys check has passed successfully. This indicates access to the <strong>MSS Board Admin Panel console</strong>.</p>
        <div style="background-color: #ffe4e6; padding: 14px; border-radius: 8px; margin: 16px 0; font-family: monospace; font-size: 13px; color: #9f1239; border-left: 4px solid #f43f5e;">
          <strong>Security Operator:</strong> System Administrator Roster<br/>
          <strong>Access Trigger Email:</strong> ${email}<br/>
          <strong>Client Address Ingress:</strong> Authorized Port 3000 Node<br/>
          <strong>Event Timestamp:</strong> ${new Date().toUTCString()}
        </div>
        <p style="font-size: 12px; color: #881337; margin-top: 16px;">This notice is dispatched securely to maintain registry alignment. If this activity was unintended or abnormal, reset your board credentials immediately.</p>
      </div>
    `;
    await sendEmail('microsoftstudentsocietyuemk@gmail.com', mailSubject, mailHtml);
  } else {
    res.status(401).json({ error: 'Console Verification Failed: Invalid email or verification password keys.' });
  }
});

// ==========================================
// TEAM DIRECTORY MANAGEMENT SERVICE
// ==========================================

app.post('/api/team', checkAdminAuth, async (req, res) => {
  try {
    const emailVal = (req.body.email || '').trim().toLowerCase();
    
    const localData = getLocalData();
    const localExists = localData.team.some((m: any) => m.email && m.email.toLowerCase() === emailVal);

    const emailExists = await runDbQuery(
      async () => {
        if (!emailVal) return false;
        const exists = await TeamMemberModel.findOne({ email: emailVal });
        return !!exists;
      },
      () => localExists
    );

    if (emailExists) {
      return res.status(400).json({ error: 'Security Conflict: A registered team member with this email already exists inside database.' });
    }

    const payload = {
      id: 'team_' + Date.now().toString(),
      name: req.body.name || 'Anonymous Member',
      email: emailVal,
      title: req.body.title || 'Executive Board Partner',
      category: req.body.category || 'executive_board',
      photoUrl: req.body.photoUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200',
      linkedinUrl: req.body.linkedinUrl || 'https://linkedin.com',
      instagramUrl: req.body.instagramUrl || '',
      sortOrder: Number(req.body.sortOrder) || (getLocalData().team ? getLocalData().team.length + 1 : 1),
      isBestMember: false,
      memberId: '',
      campus: req.body.campus || '',
      year: req.body.year || '',
      enrollmentNumber: req.body.enrollmentNumber || '',
      department: req.body.department || '',
      phone: req.body.phone || '',
      domain: req.body.domain || ''
    };

    await runDbQuery(
      async () => {
        const newMember = new TeamMemberModel(payload);
        await newMember.save();
      },
      () => {}
    );

    // Persist in local system
    localData.team.push(payload);
    saveLocalData(localData);

    // SMTP Direct Addition Alert Email
    const addSubject = `[MSS UEMK] Registration Confirmation: You have been added to the Active Organising Team!`;
    const addHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #1e293b; border-radius: 12px; background-color: #0b1329; color: #f8fafc;">
        <h2 style="color: #38bdf8; margin-bottom: 12px;">🎉 Direct Registration Approved</h2>
        <p style="font-size: 14px; color: #cbd5e1;">Hello <strong>${payload.name}</strong>,</p>
        <p style="font-size: 14px; color: #cbd5e1; line-height: 1.5;">An administrative coordinator has registered your profile inside the <strong>MSS UEM Kolkata Organising Team Member Roster</strong>!</p>
        <div style="background-color: #1e293b; padding: 14px; border-radius: 8px; font-family: monospace; font-size: 13px; color: #38bdf8; line-height: 1.6; margin: 16px 0; border-left: 4px solid #3b82f6;">
          <strong>Name:</strong> ${payload.name}<br/>
          <strong>Roster Title:</strong> ${payload.title}<br/>
          <strong>Roster Group Category:</strong> ${payload.category.replace('_', ' ').toUpperCase()}<br/>
          <strong>Assigned Email:</strong> ${payload.email}
        </div>
        <p style="font-size: 14px; color: #cbd5e1; line-height: 1.5;">You can now access the <strong>Organising Team Member Portal</strong> using your email credentials securely. Because you were directly registered by an admin, no external verification is requested at registration stage.</p>
        <p style="font-size: 11px; color: #475569; text-align: center; margin-top: 24px; border-top: 1px solid #1e293b; padding-top: 12px;">Microsoft Student Society • UEM Kolkata Secure Registry</p>
      </div>
    `;
    await sendEmail(payload.email, addSubject, addHtml);

    res.status(201).json(payload);
  } catch (err: any) {
    res.status(500).json({ error: 'Database pipeline error adding new team roster member.' });
  }
});

app.put('/api/team/:id', checkAdminAuth, async (req, res) => {
  try {
    const localData = getLocalData();
    const index = localData.team.findIndex((m) => String(m.id) === req.params.id || String(m._id) === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Target member profile was not found in active repository.' });
    }

    const original = localData.team[index];
    const emailVal = req.body.email !== undefined ? req.body.email.trim().toLowerCase() : original.email;
    
    if (emailVal && emailVal !== original.email) {
      const localConflict = localData.team.some((m: any) => m.id !== req.params.id && m.email && m.email.toLowerCase() === emailVal);
      const emailExists = await runDbQuery(
        async () => {
          const exists = await TeamMemberModel.findOne({ id: { $ne: req.params.id }, email: emailVal });
          return !!exists;
        },
        () => localConflict
      );

      if (emailExists) {
        return res.status(400).json({ error: 'Unique Email Conflict: This email address is already allocated to another active board member.' });
      }
    }

    const updatedPayload = { ...original };
    if (req.body.name !== undefined) updatedPayload.name = req.body.name;
    if (req.body.title !== undefined) updatedPayload.title = req.body.title;
    if (req.body.category !== undefined) updatedPayload.category = req.body.category;
    if (req.body.photoUrl !== undefined) updatedPayload.photoUrl = req.body.photoUrl;
    if (req.body.linkedinUrl !== undefined) updatedPayload.linkedinUrl = req.body.linkedinUrl;
    if (req.body.instagramUrl !== undefined) updatedPayload.instagramUrl = req.body.instagramUrl;
    if (req.body.sortOrder !== undefined) updatedPayload.sortOrder = Number(req.body.sortOrder);
    if (req.body.campus !== undefined) updatedPayload.campus = req.body.campus;
    if (req.body.year !== undefined) updatedPayload.year = req.body.year;
    if (req.body.enrollmentNumber !== undefined) updatedPayload.enrollmentNumber = req.body.enrollmentNumber;
    if (req.body.department !== undefined) updatedPayload.department = req.body.department;
    if (req.body.phone !== undefined) updatedPayload.phone = req.body.phone;
    if (req.body.domain !== undefined) updatedPayload.domain = req.body.domain;
    updatedPayload.email = emailVal;

    await runDbQuery(
      async () => {
        await TeamMemberModel.findOneAndUpdate(
          { id: req.params.id },
          { $set: updatedPayload },
          { new: true }
        );
      },
      () => {}
    );

    localData.team[index] = updatedPayload;
    saveLocalData(localData);

    // SMTP Profile Update Alert Email
    if (updatedPayload.email) {
      const updateSubject = `[MSS UEMK] Notification: Your Profile Details Have Been Updated`;
      const updateHtml = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #1e293b; border-radius: 12px; background-color: #0b1329; color: #f8fafc;">
          <h2 style="color: #eab308; margin-bottom: 12px;">ℹ️ Profile Credentials Modified</h2>
          <p style="font-size: 14px; color: #cbd5e1;">Hello <strong>${updatedPayload.name}</strong>,</p>
          <p style="font-size: 14px; color: #cbd5e1; line-height: 1.5;">This notice is to record that your profile in the official <strong>MSS UEM Kolkata Organising Team Member Roster</strong> was modified by an administrator.</p>
          <div style="background-color: #1e293b; padding: 14px; border-radius: 8px; font-family: monospace; font-size: 13px; color: #38bdf8; line-height: 1.6; margin: 16px 0; border-left: 4px solid #eab308;">
            <strong>Updated Title:</strong> ${updatedPayload.title}<br/>
            <strong>Updated Group Category:</strong> ${updatedPayload.category.replace('_', ' ').toUpperCase()}<br/>
            <strong>Registered Email:</strong> ${updatedPayload.email}
          </div>
          <p style="font-size: 14px; color: #cbd5e1; line-height: 1.5;">These coordinates are now live on the roster dashboard directory. If this was unexpected, please coordinate with the Chapter Leads.</p>
          <p style="font-size: 11px; color: #475569; text-align: center; margin-top: 24px; border-top: 1px solid #1e293b; padding-top: 12px;">Microsoft Student Society • UEM Kolkata Secure Registry</p>
        </div>
      `;
      await sendEmail(updatedPayload.email, updateSubject, updateHtml);
    }

    res.json(updatedPayload);
  } catch (err) {
    res.status(500).json({ error: 'Database failed to update team profile.' });
  }
});

app.delete('/api/team/:id', checkAdminAuth, async (req, res) => {
  try {
    const targetId = (req.params.id || '').trim();
    const localData = getLocalData();
    let deletedMember: any = null;

    // 1. Core cloud-database lookup using robust multiple match parameters
    if (isMongoConnected && mongoose.connection.readyState === 1) {
      try {
        deletedMember = await TeamMemberModel.findOne({
          $or: [
            { id: targetId },
            { memberId: targetId },
            { email: targetId },
            { email: new RegExp('^' + targetId + '$', 'i') },
            ...(mongoose.Types.ObjectId.isValid(targetId) ? [{ _id: targetId }] : [])
          ]
        }).lean();
      } catch (dbErr: any) {
        console.error("Direct MongoDB lookup error in delete endpoint:", dbErr.message);
      }
    }

    // 2. Fall back to local caching data lookup
    if (!deletedMember) {
      deletedMember = (localData.team || []).find((m: any) => 
        m && (
          m.id === targetId || 
          m._id === targetId || 
          String(m.id) === String(targetId) || 
          String(m._id) === String(targetId) ||
          (m.memberId && m.memberId === targetId) ||
          (m.memberId && String(m.memberId).toLowerCase() === String(targetId).toLowerCase()) ||
          (m.email && m.email.toLowerCase() === targetId.toLowerCase())
        )
      );
    }

    // 3. Absolute fail-safe search by matching stringified IDs anywhere in localData
    if (!deletedMember && targetId) {
      deletedMember = (localData.team || []).find((m: any) => 
        m && (
          String(m.id).toLowerCase() === String(targetId).toLowerCase() || 
          String(m._id).toLowerCase() === String(targetId).toLowerCase()
        )
      );
    }

    if (!deletedMember) {
      return res.status(404).json({ error: 'This organizing team member profile could not be located in either the active cloud database or local storage backups.' });
    }

    const memberUniqueId = deletedMember.id;
    const memberObjectId = deletedMember._id ? String(deletedMember._id) : '';
    const memberRosterCode = deletedMember.memberId;
    const memberEmailAddress = (deletedMember.email || '').trim().toLowerCase();

    // 4. Delete from MongoDB if connected (All rosters, pending setups, and recruitment applications to fulfill the cyclic process reset)
    if (isMongoConnected && mongoose.connection.readyState === 1) {
      try {
        // Redundant direct deletion queries for utmost structural reliability
        if (targetId) {
          await TeamMemberModel.deleteMany({ id: targetId });
          await TaskModel.deleteMany({ assignedToMemberId: targetId });
          if (mongoose.Types.ObjectId.isValid(targetId)) {
            await TeamMemberModel.deleteMany({ _id: targetId });
            await TaskModel.deleteMany({ assignedToMemberId: targetId });
          }
        }

        const filter = {
          $or: [
            ...(memberUniqueId ? [{ id: memberUniqueId }] : []),
            ...(memberObjectId && mongoose.Types.ObjectId.isValid(memberObjectId) ? [{ _id: memberObjectId }] : []),
            ...(memberRosterCode ? [{ memberId: memberRosterCode }] : []),
            ...(memberEmailAddress ? [{ email: memberEmailAddress }] : []),
            ...(memberEmailAddress ? [{ email: new RegExp('^' + memberEmailAddress + '$', 'i') }] : []),
            ...(targetId ? [{ id: targetId }] : []),
            ...(targetId && mongoose.Types.ObjectId.isValid(targetId) ? [{ _id: targetId }] : [])
          ]
        };
        const mDeleteRes = await TeamMemberModel.deleteMany(filter);
        console.log(`[MongoDB Roster Deletion] Purged matching rosters. Count: ${mDeleteRes.deletedCount}`);

        const taskFilter = {
          $or: [
            ...(memberUniqueId ? [{ assignedToMemberId: memberUniqueId }] : []),
            ...(memberObjectId ? [{ assignedToMemberId: memberObjectId }] : []),
            ...(memberRosterCode ? [{ assignedToMemberId: memberRosterCode }] : []),
            { assignedToMemberId: targetId }
          ]
        };
        const tDeleteRes = await TaskModel.deleteMany(taskFilter);
        console.log(`[MongoDB Roster Deletion] Purged associated tasks. Count: ${tDeleteRes.deletedCount}`);

        if (memberEmailAddress) {
          // Purge PendingMember & JoinRequest models as well
          await PendingMemberModel.deleteMany({ email: memberEmailAddress });
          await PendingMemberModel.deleteMany({ email: new RegExp('^' + memberEmailAddress + '$', 'i') });
          await JoinRequestModel.deleteMany({ email: memberEmailAddress });
          await JoinRequestModel.deleteMany({ email: new RegExp('^' + memberEmailAddress + '$', 'i') });

          const pDeleteRes = await PendingMemberModel.deleteMany({
            $or: [
              { email: memberEmailAddress },
              { email: new RegExp('^' + memberEmailAddress + '$', 'i') }
            ]
          });
          console.log(`[MongoDB Roster Deletion] Purged duplicate pending memberships. Count: ${pDeleteRes.deletedCount}`);

          const jDeleteRes = await JoinRequestModel.deleteMany({
            $or: [
              { email: memberEmailAddress },
              { email: new RegExp('^' + memberEmailAddress + '$', 'i') }
            ]
          });
          console.log(`[MongoDB Roster Deletion] Purged recruitment join requests. Count: ${jDeleteRes.deletedCount}`);
        }
      } catch (dbWriteErr: any) {
        console.error("Direct MongoDB delete pipeline write failure:", dbWriteErr.message);
      }
    }

    // 5. Remove from local memory files (synchronizing all collections for cyclic reset)
    localData.team = (localData.team || []).filter((m: any) => {
      if (!m) return false;
      const matchId = String(m.id).toLowerCase() === String(targetId).toLowerCase();
      const matchDbId = String(m._id).toLowerCase() === String(targetId).toLowerCase();
      const matchUID = memberUniqueId && String(m.id).toLowerCase() === String(memberUniqueId).toLowerCase();
      const matchOID = memberObjectId && String(m._id).toLowerCase() === String(memberObjectId).toLowerCase();
      const matchCode = memberRosterCode && m.memberId && String(m.memberId).toLowerCase() === String(memberRosterCode).toLowerCase();
      const matchEmail = memberEmailAddress && m.email && String(m.email).toLowerCase() === String(memberEmailAddress).toLowerCase();
      return !(matchId || matchDbId || matchUID || matchOID || matchCode || matchEmail);
    });

    localData.tasks = (localData.tasks || []).filter((t: any) => {
      if (!t) return false;
      const matchAssigned = String(t.assignedToMemberId).toLowerCase() === String(targetId).toLowerCase() ||
                            (memberUniqueId && String(t.assignedToMemberId).toLowerCase() === String(memberUniqueId).toLowerCase()) ||
                            (memberObjectId && String(t.assignedToMemberId).toLowerCase() === String(memberObjectId).toLowerCase()) ||
                            (memberRosterCode && String(t.assignedToMemberId).toLowerCase() === String(memberRosterCode).toLowerCase());
      return !matchAssigned;
    });

    if (memberEmailAddress) {
      localData.team = (localData.team || []).filter((m: any) => m && (!m.email || m.email.toLowerCase() !== memberEmailAddress));
      localData.pendingMembers = (localData.pendingMembers || []).filter((m: any) => m && (!m.email || m.email.toLowerCase() !== memberEmailAddress));
      localData.joinRequests = (localData.joinRequests || []).filter((j: any) => j && (!j.email || j.email.toLowerCase() !== memberEmailAddress));
    }
    saveLocalData(localData);

    // Create admin notification
    await createAdminNotification(
      `Core Member terminated and deleted from all registries (Cyclic Reset Activated): ${deletedMember.name} (${memberEmailAddress || 'No email'})`,
      `member_deleted`
    );

    // 6. Dynamic Gen-AI custom email rewrite via Gemini
    let aiHtmlContent = '';
    if (memberEmailAddress) {
      try {
        const ai = getAiClient();
        const aiResponse = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: `You are the formal operations board representative for the Microsoft Student Society (MSS) Chapter at the University of Engineering & Management, Kolkata (UEMK).
          We are removing the organising team roster profile for a member named "${deletedMember.name}".
          
          Please professionally rewrite and expand the following exact notification text into a very elegant, highly polished, empathetic yet firm, and formally formatted HTML email:
          "You have been terminated from the Organizing Team due to suspicious activity and/or prolonged inactivity.
          
          You may still continue as a member of MSS through standard membership drives, but you will no longer hold any position within the Organizing Team.
          
          Any ongoing projects assigned to you may still be completed according to MSS guidelines, but your participation will be considered under General Membership only, not as an Organizing Member.
          
          We appreciate your previous contributions and wish you the best for your future endeavors."

          Design and Output Guidelines:
          - Use inline-styled, modern HTML tags suitable for transmission.
          - Never wrap your response in markdown code blocks like \`\`\`html or \`\`\`. Your output MUST be pure HTML.
          - Style the email matching the official Microsoft Student Society guidelines (deep indigo or navy banner, soft borders, safe typography spacing, and clear hierarchy layout).`
        });

        aiHtmlContent = aiResponse.text || '';
      } catch (aiErr: any) {
        console.error("Failed to generate termination email text via Gemini, invoking fallback layout:", aiErr.message);
      }

      if (aiHtmlContent) {
        aiHtmlContent = aiHtmlContent.replace(/```html|```/gi, '').trim();
      }

      // Fallback layout if AI generation fails or does not return complete HTML
      if (!aiHtmlContent || !aiHtmlContent.includes('<div') || aiHtmlContent.length < 150) {
        aiHtmlContent = `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1e293b; line-height: 1.6;">
            <!-- Header Logo / Title -->
            <div style="background-color: #1e1b4b; padding: 25px; border-radius: 8px 8px 0 0; text-align: center; margin-bottom: 25px;">
              <p style="font-size: 11px; font-weight: 700; letter-spacing: 0.15em; color: #e0e7ff; margin: 0 0 8px 0; text-transform: uppercase;">Microsoft Student Society • UEMK</p>
              <h2 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 600;">Chapter Organising Status Update</h2>
            </div>
            
            <div style="padding: 0 10px;">
              <p style="font-size: 15px; margin-top: 0; color: #010409;">Dear <strong>${deletedMember.name}</strong>,</p>
              
              <p style="font-size: 14px; margin-bottom: 16px; color: #dc2626; font-weight: 600;">You have been terminated from the Organizing Team due to suspicious activity and/or prolonged inactivity.</p>
              
              <p style="font-size: 14px; margin-bottom: 16px;">You may still continue as a member of MSS through standard membership drives, but you will no longer hold any position within the Organizing Team.</p>
              
              <p style="font-size: 14px; margin-bottom: 16px;">Any ongoing projects assigned to you may still be completed according to MSS guidelines, but your participation will be considered under General Membership only, not as an Organizing Member.</p>
              
              <p style="font-size: 14px; margin-bottom: 24px;">We appreciate your previous contributions and wish you the best for your future endeavors.</p>
              
              <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 30px;">
                <p style="font-size: 13px; color: #64748b; margin: 0;">Sincerely,</p>
                <p style="font-size: 14px; font-weight: 700; color: #1e1b4b; margin: 4px 0 0 0;">Chapter Executive Board</p>
                <p style="font-size: 12px; color: #64748b; margin: 2px 0 0 0;">Microsoft Student Society (MSS), UEM Kolkata Chapter</p>
              </div>
            </div>
            
            <div style="text-align: center; margin-top: 30px; font-size: 10px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 15px;">
              This is an automated administrative notification regarding your chapter roster status.
            </div>
          </div>
        `;
      }
    }

    // 7. Core SMTP Mail Delivery (Synchronous/Awaited for verified transaction tracking)
    let emailFailedFlag = false;
    if (memberEmailAddress) {
      console.log(`[SMTP Deletion Dispatch] Attempting to deliver termination message to: ${memberEmailAddress}`);
      try {
        const mailSent = await sendEmail(memberEmailAddress, '[MSS UEMK] Roster Affiliation & Organizing Status Update', aiHtmlContent);
        if (!mailSent) {
          emailFailedFlag = true;
          console.warn(`[SMTP Deletion Mailer] Transporter returned negative dispatch status for: ${memberEmailAddress}`);
        } else {
          console.log(`[SMTP Deletion Mailer] Purge notification sent successfully to: ${memberEmailAddress}`);
        }
      } catch (mailErr: any) {
        emailFailedFlag = true;
        console.error(`[SMTP Deletion Mailer Error] Raised exception during dispatch to ${memberEmailAddress}:`, mailErr.message);
      }
    } else {
      console.warn(`[SMTP Deletion Mailer] No registered email address found for matching identity. Dispatch cancelled.`);
    }

    res.json({ 
      success: true, 
      message: 'Member has been terminated successfully, matching database logs cleared, and termination email transaction logged.',
      emailFailed: emailFailedFlag
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Database pipeline failed to execute member deletion: ' + err.message });
  }
});

// ==========================================
// EVENTS MANAGEMENT SUITE
// ==========================================

app.post('/api/events', checkAdminAuth, async (req, res) => {
  try {
    const payload = {
      id: 'event_' + Date.now().toString(),
      name: req.body.name || 'Untitled Workshop',
      description: req.body.description || '',
      date: req.body.date || new Date().toISOString().split('T')[0],
      time: req.body.time || '',
      venue: req.body.venue || '',
      logoUrl: req.body.logoUrl || 'https://picsum.photos/seed/event/600/400',
      details: req.body.details || '',
      registrationLink: req.body.registrationLink || '',
      isUpcoming: req.body.isUpcoming === true || req.body.isUpcoming === 'true',
      sortOrder: Number(req.body.sortOrder) || (getLocalData().events ? getLocalData().events.length + 1 : 1)
    };

    await runDbQuery(
      async () => {
        const newEvent = new EventItemModel(payload);
        await newEvent.save();
      },
      () => {}
    );

    const localData = getLocalData();
    localData.events.push(payload);
    saveLocalData(localData);

    res.status(201).json(payload);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create new interactive event record.' });
  }
});

app.put('/api/events/:id', checkAdminAuth, async (req, res) => {
  try {
    const localData = getLocalData();
    const index = localData.events.findIndex((e) => String(e.id) === req.params.id || String(e._id) === req.params.id);
    if (index === -1) {
      return res.status(444).json({ error: 'Event record target not located.' });
    }

    const original = localData.events[index];
    const updatedPayload = { ...original };
    if (req.body.name !== undefined) updatedPayload.name = req.body.name;
    if (req.body.description !== undefined) updatedPayload.description = req.body.description;
    if (req.body.date !== undefined) updatedPayload.date = req.body.date;
    if (req.body.time !== undefined) updatedPayload.time = req.body.time;
    if (req.body.venue !== undefined) updatedPayload.venue = req.body.venue;
    if (req.body.logoUrl !== undefined) updatedPayload.logoUrl = req.body.logoUrl;
    if (req.body.details !== undefined) updatedPayload.details = req.body.details;
    if (req.body.registrationLink !== undefined) updatedPayload.registrationLink = req.body.registrationLink;
    if (req.body.isUpcoming !== undefined) updatedPayload.isUpcoming = (req.body.isUpcoming === true || req.body.isUpcoming === 'true');
    if (req.body.sortOrder !== undefined) updatedPayload.sortOrder = Number(req.body.sortOrder);

    await runDbQuery(
      async () => {
        await EventItemModel.findOneAndUpdate(
          { id: req.params.id },
          { $set: updatedPayload },
          { new: true }
        );
      },
      () => {}
    );

    localData.events[index] = updatedPayload;
    saveLocalData(localData);

    res.json(updatedPayload);
  } catch (err) {
    res.status(500).json({ error: 'Database update of event failed.' });
  }
});

app.delete('/api/events/:id', checkAdminAuth, async (req, res) => {
  try {
    const localData = getLocalData();
    const index = localData.events.findIndex((e) => String(e.id) === req.params.id || String(e._id) === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Event target was not found to delete.' });
    }

    await runDbQuery(
      async () => {
        await EventItemModel.deleteMany({ $or: [{ id: req.params.id }, ...(mongoose.Types.ObjectId.isValid(req.params.id) ? [{ _id: req.params.id }] : [])] });
      },
      () => {}
    );

    localData.events.splice(index, 1);
    saveLocalData(localData);

    res.json({ success: true, message: 'Event record dropped from database.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to purge event from cluster database.' });
  }
});

// ==========================================
// GALLERY PHOTO ARCHIVAL PIPELINE
// ==========================================

app.post('/api/gallery', checkAdminAuth, async (req, res) => {
  try {
    const payload = {
      id: 'gallery_' + Date.now().toString(),
      title: req.body.title || 'Gallery Memory Moment',
      photoUrl: req.body.photoUrl || 'https://picsum.photos/seed/gallery/800/600',
      description: req.body.description || '',
      sortOrder: Number(req.body.sortOrder) || (getLocalData().gallery ? getLocalData().gallery.length + 1 : 1)
    };

    await runDbQuery(
      async () => {
        const newGalleryItem = new GalleryItemModel(payload);
        await newGalleryItem.save();
      },
      () => {}
    );

    const localData = getLocalData();
    localData.gallery.push(payload);
    saveLocalData(localData);

    res.status(201).json(payload);
  } catch (err) {
    res.status(500).json({ error: 'Database failed to persist new gallery artifact.' });
  }
});

app.put('/api/gallery/:id', checkAdminAuth, async (req, res) => {
  try {
    const localData = getLocalData();
    const index = localData.gallery.findIndex((g) => String(g.id) === req.params.id || String(g._id) === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Gallery object targeted was not found.' });
    }

    const original = localData.gallery[index];
    const updatedPayload = { ...original };
    if (req.body.title !== undefined) updatedPayload.title = req.body.title;
    if (req.body.photoUrl !== undefined) updatedPayload.photoUrl = req.body.photoUrl;
    if (req.body.description !== undefined) updatedPayload.description = req.body.description;
    if (req.body.sortOrder !== undefined) updatedPayload.sortOrder = Number(req.body.sortOrder);

    await runDbQuery(
      async () => {
        await GalleryItemModel.findOneAndUpdate(
          { id: req.params.id },
          { $set: updatedPayload },
          { new: true }
        );
      },
      () => {}
    );

    localData.gallery[index] = updatedPayload;
    saveLocalData(localData);

    res.json(updatedPayload);
  } catch (err) {
    res.status(500).json({ error: 'Database update of gallery item failed.' });
  }
});

app.delete('/api/gallery/:id', checkAdminAuth, async (req, res) => {
  try {
    const localData = getLocalData();
    const index = localData.gallery.findIndex((g) => String(g.id) === req.params.id || String(g._id) === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Gallery item targeted not found.' });
    }

    await runDbQuery(
      async () => {
        await GalleryItemModel.deleteMany({ $or: [{ id: req.params.id }, ...(mongoose.Types.ObjectId.isValid(req.params.id) ? [{ _id: req.params.id }] : [])] });
      },
      () => {}
    );

    localData.gallery.splice(index, 1);
    saveLocalData(localData);

    res.json({ success: true, message: 'Gallery memory cleared successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Database failed to delete photo memory.' });
  }
});

// ==========================================
// PUBLIC INBOX CONTACTS & RECRUITMENT LOGS 
// ==========================================

app.post('/api/contact', async (req, res) => {
  try {
    const payload = {
      id: 'contact_' + Date.now().toString(),
      name: req.body.name || 'Anonymous User',
      email: req.body.email || 'not-submitted@mss.org',
      subject: req.body.subject || 'General Information Inquiry',
      message: req.body.message || '',
      submittedAt: new Date().toISOString()
    };

    await runDbQuery(
      async () => {
        const newMessage = new ContactMessageModel(payload);
        await newMessage.save();
      },
      () => {}
    );

    const localData = getLocalData();
    localData.contactMessages.push(payload);
    saveLocalData(localData);

    await createAdminNotification(
      `New contact message inquiry received from ${payload.name} (${payload.email}): "${payload.subject}"`,
      `new_contact`
    );

    res.status(201).json({ success: true, message: 'Your message has been submitted. UEMK chapter MSS executives will coordinate contact soon.' });

    // SMTP Transaction: Send alert contact receipt email
    const mailSubject = `[MSS UEMK Portal] New Inquiry: ${payload.subject}`;
    const mailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #cbd5e1; border-radius: 12px; background-color: #f8fafc;">
        <h3 style="color: #4f46e5; margin-bottom: 12px;">📬 Contact Form Submission Received</h3>
        <p style="font-size: 14px; color: #334155;">Hello Operations Administrator,</p>
        <p style="font-size: 14px; color: #334155;">A user has submitted the public contact form with following descriptors:</p>
        <div style="background-color: #ffffff; padding: 14px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px; line-height: 1.6;">
          <strong>Sender Name:</strong> ${payload.name}<br/>
          <strong>Sender Email:</strong> ${payload.email}<br/>
          <strong>Subject line:</strong> ${payload.subject}<br/>
          <strong>Submission Date:</strong> ${new Date().toUTCString()}
        </div>
        <p style="font-size: 14px; font-weight: bold; margin-top: 16px; color: #4f46e5;">Submitted Inquiry Message Text:</p>
        <div style="background-color: #f1f5f9; padding: 14px; border-radius: 8px; font-style: italic; font-size: 13px; line-height: 1.5; color: #334155; border-left: 4px solid #4f46e5;">
          "${payload.message}"
        </div>
        <p style="font-size: 11px; color: #94a3b8; text-align: center; margin-top: 24px;">Microsoft Student Society • UEM Kolkata Automated Ingress</p>
      </div>
    `;
    await sendEmail('microsoftstudentsocietyuemk@gmail.com', mailSubject, mailHtml);
  } catch (err) {
    res.status(500).json({ error: 'Critical error logging and caching contact message.' });
  }
});

app.post('/api/join', async (req, res) => {
  try {
    const emailVal = (req.body.email || '').trim().toLowerCase();
    const enrollmentVal = (req.body.enrollmentNumber || '').trim();

    const localData = getLocalData();
    const now = new Date();
    let coolingActive = false;
    let activeBanItem: any = null;

    // 1. Check direct MongoDB if connected
    if (isMongoConnected && mongoose.connection.readyState === 1) {
      try {
        // Purge expired cooling blocks from MongoDB
        await JoinRequestModel.deleteMany({
          status: 'rejected',
          banExpiresAt: { $lte: now.toISOString() }
        });

        // Query active cooling-off block inside MongoDB
        const dbBan = await JoinRequestModel.findOne({
          status: 'rejected',
          $or: [
            { email: emailVal },
            { enrollmentNumber: enrollmentVal }
          ],
          banExpiresAt: { $gt: now.toISOString() }
        }).lean();

        if (dbBan) {
          coolingActive = true;
          activeBanItem = dbBan;
        }
      } catch (dbErr) {
        console.error("Direct MongoDB check failed inside join router:", dbErr);
      }
    }

    // 2. Fallback / Multi-layer validation from Local JSON Roster
    if (!coolingActive) {
      const localJoinRequests = Array.isArray(localData.joinRequests) ? localData.joinRequests : [];
      const unexpiredLocal = [];
      for (const reqItem of localJoinRequests) {
        if (reqItem.status === 'rejected' && reqItem.banExpiresAt) {
          if (new Date(reqItem.banExpiresAt) <= now) {
            // Self-purge from database backup as well
            await runDbQuery(
              async () => {
                await JoinRequestModel.deleteMany({ $or: [{ id: reqItem.id }, ...(mongoose.Types.ObjectId.isValid(reqItem.id) ? [{ _id: reqItem.id }] : [])] });
              },
              () => {}
            );
            continue; // Purged
          }
        }
        unexpiredLocal.push(reqItem);
      }

      if (unexpiredLocal.length !== localJoinRequests.length) {
        localData.joinRequests = unexpiredLocal;
        saveLocalData(localData);
      }

      const localBan = unexpiredLocal.find((reqItem: any) => {
        const isEmailMatch = reqItem.email && reqItem.email.toLowerCase() === emailVal;
        const isEnrollMatch = reqItem.enrollmentNumber && reqItem.enrollmentNumber === enrollmentVal;
        return (isEmailMatch || isEnrollMatch) && reqItem.status === 'rejected' && reqItem.banExpiresAt && new Date(reqItem.banExpiresAt) > now;
      });

      if (localBan) {
        coolingActive = true;
        activeBanItem = localBan;
      }
    }

    if (coolingActive && activeBanItem) {
      const formattedDate = new Date(activeBanItem.banExpiresAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      return res.status(400).json({
        error: `Academic Cooling Period Cooldown is Active. Your previous candidacy application was rejection-marked. Under committee standards, reapplication is blocked under the registered email ID or enrollment number until ${formattedDate}.`
      });
    }

    // Ensure email is only linked to one active record/step in the entire cluster
    let emailFoundInTeam = false;
    let emailFoundInPending = false;
    let activeRecruitmentFound = false;

    if (isMongoConnected && mongoose.connection.readyState === 1) {
      try {
        const teamMatch = await TeamMemberModel.findOne({ email: new RegExp('^' + emailVal + '$', 'i') });
        const pendingMatch = await PendingMemberModel.findOne({ email: new RegExp('^' + emailVal + '$', 'i') });
        const joinMatch = await JoinRequestModel.findOne({ email: new RegExp('^' + emailVal + '$', 'i'), status: { $ne: 'rejected' } });
        if (teamMatch) emailFoundInTeam = true;
        if (pendingMatch) emailFoundInPending = true;
        if (joinMatch) activeRecruitmentFound = true;
      } catch (dbErr) {
        console.error("Direct MongoDB checks in recruiting application failed:", dbErr);
      }
    }

    if (!emailFoundInTeam) {
      emailFoundInTeam = localData.team.some((m: any) => m.email && m.email.toLowerCase() === emailVal);
    }
    if (!emailFoundInPending) {
      emailFoundInPending = localData.pendingMembers.some((m: any) => m.email && m.email.toLowerCase() === emailVal);
    }
    if (!activeRecruitmentFound) {
      activeRecruitmentFound = localData.joinRequests.some((j: any) => j.email && j.email.toLowerCase() === emailVal && j.status !== 'rejected');
    }

    if (emailFoundInTeam) {
      return res.status(400).json({ error: 'This email address is already assigned to an active Organizing Team roster profile.' });
    }
    if (emailFoundInPending) {
      return res.status(400).json({ error: 'A pending registration application is already logged under validation review.' });
    }
    if (activeRecruitmentFound) {
      return res.status(400).json({ error: 'An active recruitment enrollment request is already registered in progress.' });
    }

    const payload = {
      id: 'join_' + Date.now().toString(),
      name: req.body.name || 'Anonymous Candidate',
      email: emailVal,
      phone: req.body.phone || '',
      year: req.body.year || '1st Year',
      department: req.body.department || 'CSE Department',
      domain: req.body.domain || 'Technical Track',
      reason: req.body.reason || '',
      campus: req.body.campus || '',
      enrollmentNumber: enrollmentVal,
      status: 'pending',
      submittedAt: new Date().toISOString()
    };

    await runDbQuery(
      async () => {
        const newRequest = new JoinRequestModel(payload);
        await newRequest.save();
      },
      () => {}
    );

    localData.joinRequests.push(payload);
    saveLocalData(localData);

    await createAdminNotification(
      `New recruitment application submitted by ${payload.name} (${payload.email}) for domain: ${payload.domain}`,
      `new_join`
    );

    res.status(201).json({ success: true, message: 'Application submitted successfully! Looking forward to meeting you during interview tracks.' });

    // SMTP Transaction: Send recruitment ticket email
    const candidateMailSubject = `[MSS UEMK Recruitment] Application Received successfully!`;
    const candidateMailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #cbd5e1; border-radius: 12px; background-color: #f0fdfa;">
        <h2 style="color: #0d9488; margin-bottom: 12px;">🌟 Recruitment Ticket Assigned</h2>
        <p style="font-size: 14px; color: #0f766e; line-height: 1.5;">Dear <strong>${payload.name}</strong>,</p>
        <p style="font-size: 14px; color: #115e59; line-height: 1.5;">Thank you for your enthusiasm to join the **Microsoft Student Society (MSS) UEM Kolkata Chapter**! Your recruitment application has been logged under review.</p>
        <div style="background-color: #ffffff; padding: 14px; border-radius: 8px; font-size: 13px; border: 1px solid #ccfbf1; color: #115e59; line-height: 1.6;">
          <strong>Applicant Name:</strong> ${payload.name}<br/>
          <strong>Year Bracket:</strong> ${payload.year}<br/>
          <strong>Branch/Department:</strong> ${payload.department}<br/>
          <strong>Preferred Domain Area:</strong> ${payload.domain}<br/>
          <strong>Contact Info:</strong> ${payload.phone || 'N/A'}<br/>
          <strong>Assigned Ticket:</strong> MSS-RECRUIT-${Date.now().toString().slice(-6)}
        </div>
        <p style="font-size: 14px; color: #115e59; line-height: 1.5; margin-top: 16px;">Our operational leads evaluate applicant profiles on rolling schedules. If aligned, you will obtain contact instructions detailing interview loops.</p>
        <div style="background-color: #ccfbf1; padding: 10px; border-radius: 8px; text-align: center; font-size: 12px; color: #115e59; font-weight: bold;">
          "Driving student innovations, cloud infrastructure, and practical generative applications at UEM Kolkata"
        </div>
        <p style="font-size: 11px; color: #14b8a6; text-align: center; margin-top: 24px;">Microsoft Student Society • Recruitment Operations</p>
      </div>
    `;
    await sendEmail(payload.email, candidateMailSubject, candidateMailHtml);
  } catch (err) {
    res.status(500).json({ error: 'Critical database failure recording recruitment application.' });
  }
});

app.delete('/api/contact/:id', checkAdminAuth, async (req, res) => {
  try {
    const localData = getLocalData();
    const index = localData.contactMessages.findIndex((m) => String(m.id) === req.params.id || String(m._id) === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Inquiry log target not found.' });
    }

    await runDbQuery(
      async () => {
        await ContactMessageModel.deleteMany({ $or: [{ id: req.params.id }, ...(mongoose.Types.ObjectId.isValid(req.params.id) ? [{ _id: req.params.id }] : [])] });
      },
      () => {}
    );

    localData.contactMessages.splice(index, 1);
    saveLocalData(localData);

    res.json({ success: true, message: 'Inquiry log archived successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Database failed to clear inquiry log.' });
  }
});

// Admin Reply to visitor contact inquiry
app.post('/api/contact/:id/reply', checkAdminAuth, async (req, res) => {
  try {
    const { replyText } = req.body;
    if (!replyText || !replyText.trim()) {
      return res.status(400).json({ error: 'Reply text is empty.' });
    }
    const localData = getLocalData();
    const index = localData.contactMessages.findIndex((m) => String(m.id) === req.params.id || String(m._id) === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Contact message not found.' });
    }
    const msg = localData.contactMessages[index];
    
    // Save reply inside the message object
    msg.replyText = replyText;
    msg.repliedAt = new Date().toISOString();

    await runDbQuery(
      async () => {
        await ContactMessageModel.findOneAndUpdate(
          { id: req.params.id },
          { $set: { replyText: replyText, repliedAt: msg.repliedAt } }
        );
      },
      () => {}
    );

    saveLocalData(localData);

    // Send Email response
    const mailSubject = `[MSS UEMK Support] Reply to your inquiry: ${msg.subject || 'Support Request'}`;
    const mailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #1e293b; border-radius: 12px; background-color: #0f172a; color: #f8fafc;">
        <h2 style="color: #38bdf8; margin-bottom: 12px; border-bottom: 1px solid #1e293b; padding-bottom: 10px;">✉️ Support Response Dispatch</h2>
        <p style="font-size: 14px; color: #94a3b8;">Hello ${msg.name},</p>
        <p style="font-size: 14px; color: #cbd5e1; line-height: 1.6;">Our MSS board administrator team has evaluated and responded to your recent support/contact inquiry filing:</p>
        
        <div style="background-color: #1a2238; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4.5px solid #3b82f6;">
          <strong style="color: #60a5fa; font-size: 11px; uppercase; display: block; margin-bottom: 6px;">Your Original Message:</strong>
          <p style="font-style: italic; color: #93c5fd; margin: 0; font-size: 13px;">"${msg.message}"</p>
        </div>

        <div style="background-color: #0b1329; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4.5px solid #10b981;">
          <strong style="color: #34d399; font-size: 11px; uppercase; display: block; margin-bottom: 6px;">Admins Official Response:</strong>
          <p style="color: #f8fafc; margin: 0; font-size: 13.5px; line-height: 1.6; white-space: pre-line;">${replyText}</p>
        </div>

        <p style="font-size: 13px; color: #94a3b8; line-height: 1.5; margin-top: 25px;">If you have further questions, feel free to reply directly to this mail string.</p>
        <p style="font-size: 10px; color: #475569; text-align: center; margin-top: 35px; border-top: 1px solid #1e293b; padding-top: 15px;">Automated support module • MSS UEMK Chapter Council</p>
      </div>
    `;

    await sendEmail(msg.email, mailSubject, mailHtml);

    res.json({ success: true, message: 'Your reply has been saved and dispatched to the sender email.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to save and send reply: ' + err.message });
  }
});

app.delete('/api/join/:id', checkAdminAuth, async (req, res) => {
  try {
    const localData = getLocalData();
    const index = localData.joinRequests.findIndex((j) => String(j.id) === req.params.id || String(j._id) === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Recruitment log target not found.' });
    }

    await runDbQuery(
      async () => {
        await JoinRequestModel.deleteMany({ $or: [{ id: req.params.id }, ...(mongoose.Types.ObjectId.isValid(req.params.id) ? [{ _id: req.params.id }] : [])] });
      },
      () => {}
    );

    localData.joinRequests.splice(index, 1);
    saveLocalData(localData);

    res.json({ success: true, message: 'Recruitment log archived successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Database failed to purge recruitment application log.' });
  }
});

// Schedule an Interview for recruitment applicant
app.post('/api/join/:id/schedule-interview', checkAdminAuth, async (req, res) => {
  try {
    const { meetLink, dateTime, note } = req.body;
    if (!meetLink || !dateTime) {
      return res.status(400).json({ error: 'Meet Link and Date & Time are required parameters.' });
    }
    const localData = getLocalData();
    const index = localData.joinRequests.findIndex((j) => String(j.id) === req.params.id || String(j._id) === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Recruitment log target not found.' });
    }
    const reqItem = localData.joinRequests[index];
    
    reqItem.status = 'interview_scheduled';
    reqItem.interviewMeetLink = meetLink;
    reqItem.interviewDateTime = dateTime;
    reqItem.interviewNote = note || '';

    await runDbQuery(
      async () => {
        await JoinRequestModel.findOneAndUpdate(
          { id: req.params.id },
          { $set: { 
              status: 'interview_scheduled', 
              interviewMeetLink: meetLink, 
              interviewDateTime: dateTime, 
              interviewNote: note || '' 
            } 
          }
        );
      },
      () => {}
    );

    saveLocalData(localData);

    // Send Email to candidate
    const mailSubject = `[MSS UEMK Recruitment] Your Interview Has Been Scheduled!`;
    const mailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #1e293b; border-radius: 12px; background-color: #0c1a30; color: #f8fafc;">
        <h2 style="color: #38bdf8; margin-bottom: 12px; border-bottom: 1px solid #1e293b; padding-bottom: 10px;">📅 Interview Stage Invitation</h2>
        <p style="font-size: 14px;">Hello <strong>${reqItem.name}</strong>,</p>
        <p style="font-size: 14px; line-height: 1.6;">Congratulations! Your recruitment application for the <strong>${reqItem.domain}</strong> division has passed the initial screening phase. We have scheduled an online interview track with the MSS Student Chairperson Council:</p>
        
        <div style="background-color: #0f172a; padding: 18px; border-radius: 10px; margin: 20px 0; border-left: 5px solid #38bdf8; line-height: 1.8; font-size: 13.5px;">
          <strong style="color: #60a5fa; uppercase; font-size: 11px; display: block; margin-bottom: 4px;">INTERVIEW LOG COORDINATES:</strong>
          <strong>Interview Date & Time:</strong> ${dateTime}<br/>
          <strong>Google Meet Link:</strong> <a href="${meetLink}" style="color: #38bdf8; font-weight: bold; text-decoration: underline;" target="_blank">${meetLink}</a>
        </div>

        ${note ? `
        <div style="background-color: #1a2238; padding: 14px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #3b82f6;">
          <strong style="color: #60a5fa; font-size: 11px; uppercase; display: block;">Notes from Core Team Admins:</strong>
          <p style="margin: 4px 0 0 0; color: #cbd5e1; font-size: 13px;">${note}</p>
        </div>
        ` : ''}

        <p style="font-size: 13px; color: #94a3b8; line-height: 1.5; margin-top: 25px;">Please make sure to set a calendar reminder and log in 5 minutes ahead of schedule with proper networking connectivity. The interview will be hosted over Google Meet.</p>
        <p style="font-size: 10px; color: #475569; text-align: center; margin-top: 35px; border-top: 1px solid #1e293b; padding-top: 15px;">Microsoft Student Society • UEM Kolkata Chapter</p>
      </div>
    `;

    const emailOutcome = await sendEmail(reqItem.email, mailSubject, mailHtml);

    res.json({ 
      success: true, 
      message: 'Interview scheduled successfully and applicant notified.',
      emailFailed: !emailOutcome
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to schedule interview: ' + err.message });
  }
});

// SELECTED or REJECTED outcome with AI Generation
app.post('/api/join/:id/decide', checkAdminAuth, async (req, res) => {
  try {
    const { decision } = req.body;
    if (decision !== 'selected' && decision !== 'rejected') {
      return res.status(400).json({ error: 'Invalid decision option. Use SELECTED or REJECTED.' });
    }

    const localData = getLocalData();
    let reqItem: any = null;

    // Direct MongoDB check to avoid out-of-sync caching latency
    try {
      if (isMongoConnected && mongoose.connection.readyState === 1) {
        reqItem = await JoinRequestModel.findOne({ id: req.params.id }).lean();
      }
    } catch (dbErr) {
      console.error("Direct MongoDB lookup error in decision branch:", dbErr);
    }

    // Disk fallback if MongoDB isn't connected or the record is pending seed
    if (!reqItem) {
      reqItem = localData.joinRequests.find((j) => String(j.id) === req.params.id || String(j._id) === req.params.id);
    }

    if (!reqItem) {
      return res.status(404).json({ error: 'Applicant record not found inside central caches.' });
    }

    const name = reqItem.name || 'Anonymous Candidate';
    const email = (reqItem.email || '').trim().toLowerCase();
    const domain = reqItem.domain || 'Technical Division';
    const campus = reqItem.campus || '';
    const year = reqItem.year || '1st Year';
    const department = reqItem.department || 'CSE Department';

    let aiGeneratedText = '';
    let ai: any = null;
    try {
      ai = getAiClient();
    } catch (aiInitErr: any) {
      console.warn("Could not load AI client (missing GEMINI_API_KEY). Proceeding with standard greeting layouts.", aiInitErr.message);
    }

    if (decision === 'selected') {
      // Generate Acceptance AI email via Gemini if available
      if (ai) {
        try {
          const decisionPrompt = `Write a highly enthusiastic, professional, and congratulatory enrollment email for a student named "${name}" who has successfully passed the interviews and is SELECTED as a Core Member of the MS Student Society UEM Kolkata Chapter in the "${domain}" domain. Mention that they belong to academic year: "${year}" and department: "${department}". Welcome them and inform them that they can sign up/in on the Organising Team Member Portal on our website and request profile approval from administrators. Write the email body politely. Keep it under 150 words.`;
          const generation = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: decisionPrompt,
            config: {
              temperature: 0.7,
              topP: 0.9,
            }
          });
          aiGeneratedText = generation.text || '';
        } catch (genErr: any) {
          console.error('Gemini content generation error:', genErr);
        }
      }

      if (!aiGeneratedText) {
        aiGeneratedText = `Dear ${name},\n\nCongratulations! We are absolutely thrilled to inform you that you have been SELECTED as a Core Team Member of the Microsoft Student Society (MSS) UEM Kolkata Chapter inside the ${domain} domain.\n\nYou can now go to the Organising Team Member Portal on our website to sign up and configure your student member credentials.\n\nBest wishes,\nMSS chapter council.`;
      }

      // Send selected email
      const acceptanceSubject = `[MSS UEMK] Congratulations! You are Selected as a Core Team Member`;
      const acceptanceHtml = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #1e293b; border-radius: 12px; background-color: #022c22; color: #f0fdf4;">
          <h2 style="color: #34d399; margin-bottom: 12px; border-bottom: 1px solid #115e59; padding-bottom: 10px;">🌟 Recruitment Outcome Status: Selected!</h2>
          <div style="background-color: #064e3b; padding: 18px; border-radius: 8px; font-size: 14.5px; line-height: 1.6; color: #ecfdf5; margin-bottom: 20px; white-space: pre-wrap;">
${aiGeneratedText}
          </div>
          <p style="font-size: 13px; color: #a7f3d0; line-height: 1.5;">Welcome to the council! You can navigate to the portal and signup to complete your profile structure.</p>
          <p style="font-size: 10px; color: #047857; text-align: center; margin-top: 35px; border-top: 1px solid #115e59; padding-top: 15px;">Microsoft Student Society • UEM Kolkata Chapter Operations</p>
        </div>
      `;
      const emailOutcome = await sendEmail(email, acceptanceSubject, acceptanceHtml);

      // Selected candidate: DELETED from joinRequest stack to prevent clutter
      await runDbQuery(
        async () => {
          await JoinRequestModel.deleteMany({ $or: [{ id: req.params.id }, ...(mongoose.Types.ObjectId.isValid(req.params.id) ? [{ _id: req.params.id }] : [])] });
        },
        () => {}
      );

      const localReqIndex = localData.joinRequests.findIndex((j) => String(j.id) === req.params.id || String(j._id) === req.params.id);
      if (localReqIndex !== -1) {
        localData.joinRequests.splice(localReqIndex, 1);
        saveLocalData(localData);
      }

      return res.json({ 
        success: true, 
        message: 'Applicant selected development phase activated.', 
        aiGeneratedText,
        emailFailed: !emailOutcome
      });

    } else {
      // Rejection
      const coolingPeriodDays = 30;
      const banExpiresAt = new Date(Date.now() + coolingPeriodDays * 24 * 60 * 60 * 1000).toISOString();

      if (ai) {
        try {
          const rejectionPrompt = `Write a polite, warm, and highly encouraging rejection email for a student named "${name}" who applied to join the MS Student Society UEM Kolkata Chapter in the "${domain}" domain, but is NOT selected. Be extremely respectful, constructive, praise their enthusiasm, and kindly inform them that their application has entered a 30-day cooling period after which they are welcome to reapply. Write the email body politely. Keep it under 150 words.`;
          const generation = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: rejectionPrompt,
            config: {
              temperature: 0.7,
              topP: 0.9,
            }
          });
          aiGeneratedText = generation.text || '';
        } catch (genErr: any) {
          console.error('Gemini content generation error:', genErr);
        }
      }

      if (!aiGeneratedText) {
        aiGeneratedText = `Dear ${name},\n\nThank you so much for your interest in joining the Microsoft Student Society (MSS) UEM Kolkata Chapter as a Core Member.\n\nAfter careful consideration of all candidacy logs, we regret to inform you that we are not moving forward with your application at this time. However, we encourage you to stay active in our tracks and reapply in 30 days after your cooling period has expired.\n\nThank you again for your time,\nMSS chapter council`;
      }

      // Send rejection email
      const rejectionSubject = `[MSS UEMK] Recruitment Outlook decision update`;
      const rejectionHtml = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #1e293b; border-radius: 12px; background-color: #450a0a; color: #fef2f2;">
          <h2 style="color: #fca5a5; margin-bottom: 12px; border-bottom: 1px solid #7f1d1d; padding-bottom: 10px;">ℹ️ Recruitment Outcome Status</h2>
          <div style="background-color: #7f1d1d; padding: 18px; border-radius: 8px; font-size: 14.5px; line-height: 1.6; color: #fee2e2; margin-bottom: 20px; white-space: pre-wrap;">
${aiGeneratedText}
          </div>
          <p style="font-size: 13px; color: #fca5a5; line-height: 1.5;">We operate a standard 30-day cooling timer, after which your application record is deleted from system structures and you can reapply.</p>
          <p style="font-size: 10px; color: #ef4444; text-align: center; margin-top: 35px; border-top: 1px solid #7f1d1d; padding-top: 15px;">Microsoft Student Society • UEM Kolkata Chapter Operations</p>
        </div>
      `;
      const emailOutcome = await sendEmail(email, rejectionSubject, rejectionHtml);

      const decidedTimeStr = new Date().toISOString();

      // Save rejected cooling period status in DB
      await runDbQuery(
        async () => {
          await JoinRequestModel.findOneAndUpdate(
            { id: req.params.id },
            { $set: { 
                status: 'rejected', 
                banExpiresAt: banExpiresAt, 
                aiGeneratedText: aiGeneratedText, 
                decidedAt: decidedTimeStr 
              } 
            }
          );
        },
        () => {}
      );

      const localReqIndex = localData.joinRequests.findIndex((j) => String(j.id) === req.params.id || String(j._id) === req.params.id);
      if (localReqIndex !== -1) {
        localData.joinRequests[localReqIndex].status = 'rejected';
        localData.joinRequests[localReqIndex].banExpiresAt = banExpiresAt;
        localData.joinRequests[localReqIndex].aiGeneratedText = aiGeneratedText;
        localData.joinRequests[localReqIndex].decidedAt = decidedTimeStr;
        saveLocalData(localData);
      }

      return res.json({ 
        success: true, 
        message: 'Applicant rejected and placed on cooling lock.', 
        aiGeneratedText,
        banExpiresAt,
        emailFailed: !emailOutcome
      });
    }

  } catch (err: any) {
    console.error("Critical error in recruitment decision branch:", err);
    res.status(500).json({ error: 'Failed to process recruitment decision: ' + err.message });
  }
});

// ==========================================
// PORTAL RECRUITS, INTERACTIVE STATUS & TASKS
// ==========================================

// Award/Revoke Best Working Member Elite status
app.put('/api/team/:id/best', checkAdminAuth, async (req, res) => {
  try {
    const localData = getLocalData();
    const index = localData.team.findIndex((m) => String(m.id) === req.params.id || String(m._id) === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Roster profile seek target not found in active dataset.' });
    }

    const member = localData.team[index];
    if (member.category !== 'student_member') {
      return res.status(400).json({ 
        error: 'Eligibility Standard Violation: The Best Working Member ★ Elite status is strictly reserved for normal Student Members. Advisory Boards, executive councils, session directors and leads are ineligible.' 
      });
    }

    const isBestVal = req.body.isBestMember === true || req.body.isBestMember === 'true';
    
    await runDbQuery(
      async () => {
        await TeamMemberModel.findOneAndUpdate({ id: req.params.id }, { $set: { isBestMember: isBestVal } });
      },
      () => {}
    );

    // Persist modifications locally
    member.isBestMember = isBestVal;
    saveLocalData(localData);

    res.json(member);

    // SMTP Action: Celebrate Best Member Award if assigned
    if (isBestVal) {
      const mailSubject = `[MSS UEMK Board Congratulation] ★ Selected as the BEST WORKING MEMBER!`;
      const mailHtml = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 2px solid #fef08a; border-radius: 16px; background-color: #fefce8;">
          <div style="text-align: center; margin-bottom: 20px;">
            <span style="font-size: 50px; line-height: 1; display: block;">🏆</span>
            <h2 style="color: #a16207; margin: 10px 0; font-weight: 900; tracking: tight;">BEST WORKING MEMBER AWARD</h2>
            <span style="font-size: 12px; font-family: monospace; background-color: #fef9c yellow; color: #854d0e; padding: 4px 10px; border-radius: 20px; font-weight: bold; border: 1px solid #fdec0a;">OFFICIAL DECORATION STAR</span>
          </div>
          <p style="font-size: 14px; color: #451a03;">Dear <strong>${member.name}</strong>,</p>
          <p style="font-size: 14px; color: #451a03; line-height: 1.6;">It is a pride moment for all of us! The Microsoft Student Society Executive Board and CSE Faculty Coordinators are exceptionally proud to confer upon you the prestigious **Best Working Member** award.</p>
          <div style="background-color: #ffffff; border: 1px dashed #ca8a04; padding: 16px; border-radius: 12px; margin: 18px 0; font-style: italic; text-align: center; font-size: 13.5px; color: #713f12; line-height: 1.5; font-family: Georgia, serif;">
            "In recognition of your outstanding performance, hands-on software contributions, cloud builds, and proactive leadership during the continuous chapter sessions."
          </div>
          <p style="font-size: 14px; color: #451a03; line-height: 1.6;">Your profile is now decorated with the <strong>Elite Star Badge</strong> on our live public website portal. Keep championing cloud innovation and driving community operations forward!</p>
          <p style="font-size: 15px; font-weight: bold; color: #854d0e;">Keep shining,</p>
          <p style="font-size: 13px; color: #a16250; margin: 0;">Presidency Core & Faculty Advisory Team<br/>Microsoft Student Society (MSS) UEMK</p>
          <p style="font-size: 11px; color: #ca8a04; text-align: center; margin-top: 30px; border-top: 1px solid #fef08a; padding-top: 18px;">Automated Security Dispatch • Microsoft Student Society Roster</p>
        </div>
      `;
      await sendEmail(member.email, mailSubject, mailHtml);
    }
  } catch (err) {
    res.status(500).json({ error: 'Database pipeline failed updating star rating status.' });
  }
});

// Member Workspace Public Signup REVIEW submission
app.post('/api/member/signup', async (req, res) => {
  try {
    const { name, email, title, category, photoUrl, linkedinUrl, instagramUrl, sortOrder } = req.body;
    
    if (!name || !email) {
      return res.status(400).json({ error: 'Request Denied: Please provide both your Registered Full Name and a contact Email address.' });
    }
    if (!photoUrl || !photoUrl.trim()) {
      return res.status(400).json({ error: 'Validation Error: Upload or supply of profile photo is compulsory.' });
    }
    if (!linkedinUrl || !linkedinUrl.trim()) {
      return res.status(400).json({ error: 'Validation Error: LinkedIn profile URL link is compulsory.' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Verify uniqueness locally and dynamically from direct database queries if connected
    let alreadyInTeam = false;
    let alreadyPending = false;

    // Direct MongoDB checks
    if (isMongoConnected && mongoose.connection.readyState === 1) {
      try {
        const dbTeamMatch = await TeamMemberModel.findOne({ email: new RegExp('^' + cleanEmail + '$', 'i') });
        const dbPendingMatch = await PendingMemberModel.findOne({ email: new RegExp('^' + cleanEmail + '$', 'i') });
        if (dbTeamMatch) alreadyInTeam = true;
        if (dbPendingMatch) alreadyPending = true;
      } catch (dbErr) {
        console.error("Direct MongoDB checks in signup failed:", dbErr);
      }
    }

    const localData = getLocalData();
    if (!alreadyInTeam) {
      alreadyInTeam = localData.team.some((m: any) => m.email && m.email.toLowerCase() === cleanEmail);
    }
    if (!alreadyPending) {
      alreadyPending = localData.pendingMembers.some((m: any) => m.email && m.email.toLowerCase() === cleanEmail);
    }

    if (alreadyInTeam) {
      return res.status(400).json({ error: 'Validation Error: This email address is already registered and assigned to an active team member roster.' });
    }
    if (alreadyPending) {
      return res.status(400).json({ error: 'Validation Error: A pending registration request was already dispatched from this email address.' });
    }

    const validCategories = ['faculty_advisory', 'executive_board', 'session_leads', 'student_member', 'student_alumni'];
    const finalCategory = validCategories.includes(category) ? category : 'student_member';

    const payload = {
      id: 'pending_' + Date.now().toString(),
      name,
      email: cleanEmail,
      title: title || 'Core Member',
      category: finalCategory,
      photoUrl,
      linkedinUrl,
      instagramUrl: instagramUrl || '',
      sortOrder: sortOrder ? Number(sortOrder) : undefined,
      submittedAt: new Date().toISOString()
    };

    await runDbQuery(
      async () => {
        const newPending = new PendingMemberModel(payload);
        await newPending.save();
      },
      () => {}
    );

    // Save local back-up
    localData.pendingMembers.push(payload);
    saveLocalData(localData);

    await createAdminNotification(
      `New portal registration via Manual Signup: ${name} (${cleanEmail})`,
      'new_join'
    );

    res.status(201).json({
      success: true,
      message: 'Registered successfully! Your application has been logged inside our validation pipeline. Once MSS Board admins approve your profile, it will go live on the site roster and a sequential ID will be issued!'
    });

    // SMTP Transaction: Send signup acknowledgement email to applicant
    const signupMailSubject = `[MSS UEMK Portal] Registration Initiated Successfully`;
    const signupMailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #f8fafc;">
        <h2 style="color: #4f46e5; margin-bottom: 12px;">🚪 Portal Enrollment Logged</h2>
        <p style="font-size: 14px; color: #334155;">Hello <strong>${name}</strong>,</p>
        <p style="font-size: 14px; color: #334155; line-height: 1.5;">Thank you for registering your membership profile with the Microsoft Student Society. We have received your data payload safely:</p>
        <div style="background-color: #f1f5f9; padding: 14px; border-radius: 8px; font-family: monospace; font-size: 13px; color: #334155; line-height: 1.6; margin: 16px 0; border-left: 4px solid #4f46e5;">
          <strong>Target Full Name:</strong> ${name}<br/>
          <strong>Assigned Class-Category:</strong> ${finalCategory.replace('_', ' ').toUpperCase()}<br/>
          <strong>Member Tagline Title:</strong> ${title || 'Core Member'}<br/>
          <strong>Supplied Contact Email:</strong> ${cleanEmail}<br/>
          <strong>LinkedIn Dossier:</strong> ${linkedinUrl}
        </div>
        <p style="font-size: 14px; color: #334155; line-height: 1.5;">Our administrator boards check registrations daily to ensure only bona fide chapter student-advocates can write tasks. Once approved by the core council, you will receive a congratulatory email containing your Portal sequence identification key.</p>
        <p style="font-size: 11px; color: #94a3b8; text-align: center; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 12px;">Automated Security Portal Sentinel System • MSS UEMK</p>
      </div>
    `;
    await sendEmail(cleanEmail, signupMailSubject, signupMailHtml);

  } catch (err) {
    res.status(500).json({ error: 'Critical database failure recording member sign up.' });
  }
});

// Admin Approve Pending Member candidate
app.post('/api/pending-members/:id/approve', checkAdminAuth, async (req, res) => {
  try {
    const localData = getLocalData();
    const pendingIndex = localData.pendingMembers.findIndex((m) => String(m.id) === req.params.id || String(m._id) === req.params.id);
    if (pendingIndex === -1) {
      return res.status(404).json({ error: 'Target pending registration request was not found in database.' });
    }

    const pendingDoc = localData.pendingMembers[pendingIndex];
    const category = pendingDoc.category || 'student_member';
    
    // Count items in category inside localData to determine sort order
    const categoryCount = localData.team.filter((m: any) => m.category === category).length;

    const payload = {
      id: 'team_' + Date.now().toString(),
      name: pendingDoc.name,
      email: pendingDoc.email,
      title: pendingDoc.title,
      category,
      photoUrl: pendingDoc.photoUrl,
      linkedinUrl: pendingDoc.linkedinUrl,
      instagramUrl: pendingDoc.instagramUrl,
      sortOrder: pendingDoc.sortOrder || (categoryCount + 1),
      isBestMember: false,
      memberId: ''
    };

    await runDbQuery(
      async () => {
        const newMember = new TeamMemberModel(payload);
        await newMember.save();
        await PendingMemberModel.deleteMany({ $or: [{ id: req.params.id }, ...(mongoose.Types.ObjectId.isValid(req.params.id) ? [{ _id: req.params.id }] : [])] });
      },
      () => {}
    );

    // Save locally
    localData.team.push(payload);
    localData.pendingMembers.splice(pendingIndex, 1);
    saveLocalData(localData);

    // Generate credentials ID and find code
    assignMemberSequencesForArray(localData.team);
    const matchedProfile = localData.team.find((m: any) => m.email && m.email.toLowerCase() === pendingDoc.email.toLowerCase());
    const finalSequenceId = matchedProfile ? matchedProfile.memberId : ('MB-' + (categoryCount + 1));

    res.json({ success: true, message: 'Registry request approved into Active roster!', member: payload });

    // SMTP Action: Congratulations dispatch containing Member Credentials
    const approvalMailSubject = `[MSS UEMK Portal] Access Approved! Your Sequential Member ID Assigned 🎉`;
    const approvalMailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
        <h2 style="color: #10b981; margin-bottom: 12px; font-weight: 900;">WELCOME TO THE WORKSPACE!</h2>
        <p style="font-size: 14px; color: #334155;">Hello <strong>${pendingDoc.name}</strong>,</p>
        <p style="font-size: 14px; color: #334155; line-height: 1.6;">Your membership registry application has been officially <strong>validated and approved</strong> by the Microsoft Student Society Council!</p>
        <p style="font-size: 14px; color: #334155; line-height: 1.6;">Your professional roster profile is now live! An identity coordinate key has been allocated and structured for you:</p>
        <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 18px; border-radius: 12px; margin: 20px 0; text-align: center;">
          <span style="font-size: 11px; font-family: monospace; color: #166534; display: block; text-transform: uppercase; letter-spacing: 1px; font-weight: bold; margin-bottom: 6px;">PORTAL VERIFIED LOGIN CREDENTIALS</span>
          <strong style="font-size: 32px; font-family: monospace; color: #15803d; letter-spacing: 3px; display: block; margin-bottom: 6px;">${finalSequenceId}</strong>
          <span style="font-size: 13px; font-family: monospace; color: #15803d; display: block; font-weight: bold;">Login Contact Email: ${pendingDoc.email}</span>
        </div>
        <p style="font-size: 14px; color: #334155; line-height: 1.6;">You can now navigate to the <strong>Member Portal / Workspace tab</strong> in our application and sign in. You can inspect assignments, complete project briefs, and submit links securely.</p>
        <div style="text-align: center; margin-top: 20px;">
          <a href="#portal" style="display: inline-block; background-color: #10b981; color: white; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: bold; transition: all 0.2s;">Enter Member Portal</a>
        </div>
        <p style="font-size: 11px; color: #94a3b8; text-align: center; margin-top: 26px; border-top: 1px solid #f1f5f9; padding-top: 16px;">Microsoft Student Society • UEM Kolkata Chapter</p>
      </div>
    `;
    await sendEmail(pendingDoc.email, approvalMailSubject, approvalMailHtml);

  } catch (err) {
    res.status(500).json({ error: 'Critical server error occurred during approving candidate.' });
  }
});

// Admin Reject Pending Member candidate
app.delete('/api/pending-members/:id/reject', checkAdminAuth, async (req, res) => {
  try {
    const localData = getLocalData();
    const index = localData.pendingMembers.findIndex((m) => String(m.id) === req.params.id || String(m._id) === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Pending registration request not located in active database.' });
    }

    await runDbQuery(
      async () => {
        await PendingMemberModel.deleteMany({ $or: [{ id: req.params.id }, ...(mongoose.Types.ObjectId.isValid(req.params.id) ? [{ _id: req.params.id }] : [])] });
      },
      () => {}
    );

    localData.pendingMembers.splice(index, 1);
    saveLocalData(localData);

    res.json({ success: true, message: 'Pending registry rejected and candidate cleared.' });
  } catch (err) {
    res.status(500).json({ error: 'Database failed core delete on pending candidate.' });
  }
});

// Secure Member Logon Suite (Step 1: Check credentials & send OTP, Step 2: Verify OTP)
app.post('/api/member/login/request-otp', async (req, res) => {
  try {
    const { memberId, email } = req.body;
    if (!memberId || !email) {
      return res.status(400).json({ error: 'Access Denied: Both Member ID and Registered Email are mandatory.' });
    }

    const searchId = memberId.trim().toUpperCase();
    const searchEmail = email.trim().toLowerCase();

    const localData = getLocalData();
    assignMemberSequencesForArray(localData.team);

    const foundMember = localData.team.find((m: any) => {
      return m.memberId && m.memberId.toUpperCase() === searchId && m.email && m.email.toLowerCase() === searchEmail;
    });

    if (!foundMember) {
      return res.status(401).json({
        error: `Authentication failed. No active member matches ID "${searchId}" and registered Email "${searchEmail}".`
      });
    }

    // Generate 6 digit login OTP
    const loginOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes validity

    // Save in cached OTP collection
    activeOTPs.set(`login_${searchEmail}`, { otp: loginOtp, expiresAt });

    console.log(`[Member Login OTP] Generated OTP ${loginOtp} for ${searchEmail}.`);

    // SMTP Mail Dispatch
    const mailSubject = `[MSS UEMK Portal] ${loginOtp} is your Safe Authentication Key`;
    const mailHtml = `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 30px; border: 1px solid #1e293b; border-radius: 16px; background-color: #0b1329; color: #f8fafc; box-shadow: 0 10px 25px rgba(0,0,0,0.4);">
        <div style="text-align: center; border-bottom: 1px solid #334155; padding-bottom: 20px; margin-bottom: 24px;">
          <h2 style="color: #38bdf8; margin: 0; font-size: 20px; letter-spacing: 2px;">MICROSOFT STUDENT SOCIETY</h2>
          <p style="color: #64748b; margin: 5px 0 0 0; font-size: 11px; font-family: monospace;">UEM KOLKATA CHAPTER MEMBERS AREA</p>
        </div>
        
        <p style="font-size: 14px; line-height: 1.6; color: #cbd5e1;">Dear ${foundMember.name},</p>
        <p style="font-size: 14px; line-height: 1.6; color: #cbd5e1;">You requested a login authorization code to sign in to the Organising Team Member Portal. Your secure OTP code is:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-family: monospace; display: inline-block; font-size: 36px; font-weight: 800; letter-spacing: 6px; color: #34d399; background-color: #0f172a; padding: 16px 36px; border-radius: 12px; border: 1px solid #10b981; box-shadow: 0 0 15px rgba(16,185,129,0.15);">${loginOtp}</span>
        </div>
        
        <p style="font-size: 11px; text-align: center; color: #64748b; line-height: 1.5;">This key expires in <strong>5 minutes</strong>. Under no circumstances should you share this code.</p>
        
        <div style="border-top: 1px solid #1e293b; padding-top: 15px; margin-top: 25px; text-align: center;">
          <p style="font-size: 10px; color: #475569; margin: 0;">Automated Security Dispatch Token • MSS UEMK Chapter Security</p>
        </div>
      </div>
    `;

    const mailSent = await sendEmail(searchEmail, mailSubject, mailHtml);

    res.json({
      success: true,
      mailSent,
      message: `A secure authentication OTP has been dispatched to your email. Please review your inbox/spam folder.`
    });

  } catch (err: any) {
    res.status(500).json({ error: 'Server authentication OTP generation collapsed: ' + err.message });
  }
});

// Member OTP verification & session token response
app.post('/api/member/login/verify-otp', async (req, res) => {
  try {
    const { memberId, email, otp } = req.body;
    if (!memberId || !email || !otp) {
      return res.status(400).json({ error: 'Both credentials and verification code are mandatory.' });
    }

    const searchId = memberId.trim().toUpperCase();
    const searchEmail = email.trim().toLowerCase();

    const localData = getLocalData();
    assignMemberSequencesForArray(localData.team);

    const foundMember = localData.team.find((m: any) => {
      return m.memberId && m.memberId.toUpperCase() === searchId && m.email && m.email.toLowerCase() === searchEmail;
    });

    if (!foundMember) {
      return res.status(401).json({ error: 'Validation Declined. Credentials mismatch.' });
    }

    // Verify OTP
    const recordKey = `login_${searchEmail}`;
    const otpRecord = activeOTPs.get(recordKey);

    if (!otpRecord) {
      return res.status(400).json({ error: 'No active login session requested for this student coordinates.' });
    }

    if (Date.now() > otpRecord.expiresAt) {
      activeOTPs.delete(recordKey);
      return res.status(400).json({ error: 'Your login verification code has expired. Please try requesting a new OTP.' });
    }

    if (otpRecord.otp !== otp.trim()) {
      return res.status(400).json({ error: 'Authentication key mismatch. Permission declined.' });
    }

    // Authenticated! Clean OTP cache
    activeOTPs.delete(recordKey);

    res.json({
      success: true,
      token: `mss-member-token-${foundMember.id}`,
      member: foundMember
    });

    await createAdminNotification(
      `Member ${foundMember.name} (ID: ${foundMember.memberId}) signed into the Organising Portal.`,
      'info'
    );

    // Sign-in Alert Email
    const userMailSubject = `[MSS UEMK Portal] Alert: Successful Portal login initialized`;
    const userMailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #1e293b; border-radius: 12px; background-color: #0b1329; color: #f8fafc;">
        <h2 style="color: #38bdf8; margin-bottom: 12px;">🔒 SECURED PORTAL ACCESS GAINED</h2>
        <p style="font-size: 14px; color: #cbd5e1;">Hello <strong>${foundMember.name}</strong>,</p>
        <p style="font-size: 14px; color: #cbd5e1; line-height: 1.5;">This notice certifies that a secure visitor session on your Organising Team Member workspace has been authorized over secure OTP validation.</p>
        <div style="background-color: #1e293b; padding: 14px; border-radius: 8px; font-family: monospace; font-size: 13px; color: #38bdf8; line-height: 1.6; margin: 16px 0; border-left: 4px solid #3b82f6;">
          <strong>Member Name:</strong> ${foundMember.name}<br/>
          <strong>Member ID:</strong> ${foundMember.memberId}<br/>
          <strong>Portal Section:</strong> Organising Team Portal Area<br/>
          <strong>Timestamp:</strong> ${new Date().toUTCString()}
        </div>
        <p style="font-size: 11px; color: #475569;">If this session was not initialized by you, please report to leads immediately.</p>
      </div>
    `;
    await sendEmail(foundMember.email, userMailSubject, userMailHtml);

  } catch (err: any) {
    res.status(500).json({ error: 'Verifying OTP crashed inside server: ' + err.message });
  }
});

// Complete profile credentials for signed-in members
app.put('/api/member/profile', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer mss-member-token-')) {
      return res.status(401).json({ error: 'Access Denied: Valid Session Key required.' });
    }

    const memberDbId = authHeader.replace('Bearer mss-member-token-', '');
    const localData = getLocalData();
    const index = localData.team.findIndex((m: any) => m.id === memberDbId);

    if (index === -1) {
      return res.status(440).json({ error: 'Session expired or student member profile deleted from registry.' });
    }

    const member = localData.team[index];

    // Read academic/credentials profile fields
    const { campus, year, enrollmentNumber, department, phone, domain, name, email } = req.body;

    if (!campus || !year || !enrollmentNumber || !department || !phone || !domain) {
      return res.status(400).json({ error: 'All profile completions coordinates (campus, year, enrollment number, department, whatsapp phone, domain) are strictly required.' });
    }

    const previousEmail = member.email;

    // Update payload
    member.campus = campus;
    member.year = year;
    member.enrollmentNumber = enrollmentNumber;
    member.department = department;
    member.phone = phone;
    member.domain = domain;
    if (name) member.name = name;
    if (email) member.email = email.trim().toLowerCase();

    // Persist to MongoDB
    await runDbQuery(
      async () => {
        const updateObj: any = { campus, year, enrollmentNumber, department, phone, domain };
        if (name) updateObj.name = name;
        if (email) updateObj.email = email.trim().toLowerCase();
        await TeamMemberModel.findOneAndUpdate(
          { id: memberDbId },
          { $set: updateObj },
          { new: true }
        );
      },
      () => {}
    );

    saveLocalData(localData);

    // Create admin notification
    await createAdminNotification(
      `Core Member ${member.name} (${member.email}) edited & completed profile details: Campus - ${campus}, Year - ${year}, Enrollment - ${enrollmentNumber}, Department - ${department}, Phone - ${phone}, Domain - ${domain}`,
      `profile_update`
    );

    // Send transaction email to member
    const profileHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #fafafa;">
        <h2 style="color: #0284c7; margin-top: 0; border-b: 1px solid #e2e8f0; padding-bottom: 10px;">🛡️ MSS UEMK Profile Update Confirmation</h2>
        <p>Hello <strong>${member.name}</strong>,</p>
        <p>Your member profile has been updated and completed successfully!</p>
        <div style="background-color: #ffffff; padding: 18px; border-radius: 8px; border-left: 4px solid #0284c7; margin: 20px 0; border-top: 1px solid #f1f5f9; border-right: 1px solid #f1f5f9; border-bottom: 1px solid #f1f5f9;">
          <p style="margin: 6px 0; font-size: 13px;"><strong>Name:</strong> ${member.name}</p>
          <p style="margin: 6px 0; font-size: 13px;"><strong>Institution/Campus:</strong> ${campus}</p>
          <p style="margin: 6px 0; font-size: 13px;"><strong>Academic Year:</strong> ${year}</p>
          <p style="margin: 6px 0; font-size: 13px;"><strong>Enrollment Number:</strong> ${enrollmentNumber}</p>
          <p style="margin: 6px 0; font-size: 13px;"><strong>Department/Stream:</strong> ${department}</p>
          <p style="margin: 6px 0; font-size: 13px;"><strong>WhatsApp/Phone Number:</strong> ${phone}</p>
          <p style="margin: 6px 0; font-size: 13px;"><strong>Selected Domain:</strong> ${domain}</p>
          <p style="margin: 6px 0; font-size: 13px;"><strong>Personal Email ID:</strong> ${member.email}</p>
        </div>
        <p style="font-size: 11px; color: #64748b; line-height: 1.5;">If you did not initiate this change, please immediately get in touch with the MSS UEMK executive board or Chapter Admins.</p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="font-size: 10px; color: #94a3b8; text-align: center;">Microsoft Student Society (MSS) UEM Kolkata Admin Council</p>
      </div>
    `;
    await sendEmail(member.email, 'MSS UEMK Profile Update Confirmation', profileHtml)
      .catch(err => console.error("Failed sending profile update email:", err));

    if (previousEmail && previousEmail.toLowerCase() !== member.email.toLowerCase()) {
      await sendEmail(previousEmail, 'MSS UEMK Profile Update Confirmation (Email Changed)', profileHtml)
        .catch(err => console.error("Failed sending profile update email to previous address:", err));
    }

    res.json({
      success: true,
      message: 'Active profile completed successfully!',
      member
    });

  } catch (err: any) {
    res.status(500).json({ error: 'Failed updating student profile: ' + err.message });
  }
});

// ==========================================
// TASKS OPERATIONS SUITE
// ==========================================

app.get('/api/tasks', async (req, res) => {
  try {
    const localData = getLocalData();
    res.json(localData.tasks);
  } catch (err) {
    res.status(500).json({ error: 'Failed to seek tasks.' });
  }
});

app.post('/api/tasks', checkAdminAuth, async (req, res) => {
  try {
    const assignedIdClean = (req.body.assignedToMemberId || '').trim().toUpperCase();
    
    const payload = {
      id: 'task_' + Date.now().toString(),
      assignedToMemberId: assignedIdClean,
      title: req.body.title || 'Assigned Microsoft Society Objective',
      description: req.body.description || '',
      deadline: req.body.deadline || 'No Deadline Configured',
      status: 'assigned',
      submissionNotes: '',
      submissionLink: '',
      submittedAt: ''
    };

    await runDbQuery(
      async () => {
        const newTask = new TaskModel(payload);
        await newTask.save();
      },
      () => {}
    );

    const localData = getLocalData();
    localData.tasks.push(payload);
    saveLocalData(localData);

    res.status(201).json(payload);

    // SMTP Transaction: Fetch member detail and dispatch direct assignment email notice
    assignMemberSequencesForArray(localData.team);
    const targetMember = localData.team.find((m: any) => m.memberId && m.memberId.toUpperCase() === assignedIdClean);
    if (targetMember && targetMember.email) {
      const taskMailSubject = `[MSS UEMK Portal] Action Required: New Task Assigned - "${payload.title}"`;
      const taskMailHtml = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #cbd5e1; border-radius: 12px; background-color: #fcfcfc;">
          <h2 style="color: #4f46e5; margin-bottom: 12px; font-weight: 800;">📋 NEW TASKS DELIVERABLE</h2>
          <p style="font-size: 14px; color: #334155;">Hello <strong>${targetMember.name}</strong>,</p>
          <p style="font-size: 14px; color: #334155; line-height: 1.5;">The Faculty advisory board and executive directors have assigned a deliverable objective to you:</p>
          <div style="background-color: #f5f3ff; border: 1px solid #ddd6fe; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <strong style="font-size: 16px; color: #5b21b6; display: block; margin-bottom: 6px;">${payload.title}</strong>
            <p style="font-size: 13.5px; color: #475569; line-height: 1.4; margin: 0 0 10px 0;">${payload.description || 'No detailed specifications entered.'}</p>
            <div style="font-size: 11px; font-family: monospace; color: #be123c; font-weight: bold; background-color: #ffe4e6; padding: 4px 8px; border-radius: 4px; display: inline-block;">
              ⚠️ DEADLINE TARGET: ${payload.deadline}
            </div>
          </div>
          <p style="font-size: 14px; color: #334155; line-height: 1.5;">Please sign into the <strong>MSS Member Workspace Portal</strong> using your Sequence ID (<strong>${targetMember.memberId}</strong>) to update submission links and draft delivery notes.</p>
          <p style="font-size: 11px; color: #94a3b8; text-align: center; margin-top: 24px;">Microsoft Student Society • UEM Kolkata operations</p>
        </div>
      `;
      await sendEmail(targetMember.email, taskMailSubject, taskMailHtml);
    }

  } catch (err) {
    res.status(500).json({ error: 'Failed to create and assign new task.' });
  }
});

app.put('/api/tasks/:id', async (req, res) => {
  try {
    const localData = getLocalData();
    const index = localData.tasks.findIndex((t) => String(t.id) === req.params.id || String(t._id) === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Target task seek index not loaded.' });
    }

    const original = localData.tasks[index];
    const updatedPayload = { ...original };
    if (req.body.title !== undefined) updatedPayload.title = req.body.title;
    if (req.body.description !== undefined) updatedPayload.description = req.body.description;
    if (req.body.deadline !== undefined) updatedPayload.deadline = req.body.deadline;
    if (req.body.status !== undefined) updatedPayload.status = req.body.status;
    if (req.body.submissionNotes !== undefined) updatedPayload.submissionNotes = req.body.submissionNotes;
    if (req.body.submissionLink !== undefined) updatedPayload.submissionLink = req.body.submissionLink;
    if (req.body.submittedAt !== undefined) updatedPayload.submittedAt = req.body.submittedAt;
    if (req.body.assignedToMemberId !== undefined) updatedPayload.assignedToMemberId = req.body.assignedToMemberId.trim().toUpperCase();

    await runDbQuery(
      async () => {
        await TaskModel.findOneAndUpdate(
          { id: req.params.id },
          { $set: updatedPayload },
          { new: true }
        );
      },
      () => {}
    );

    localData.tasks[index] = updatedPayload;
    saveLocalData(localData);

    const shouldNotifyCompletion = updatedPayload.status === 'completed' && original.status !== 'completed';
    if (shouldNotifyCompletion) {
      const assignedMember = localData.team.find((m: any) => m.memberId && m.memberId.toUpperCase() === String(updatedPayload.assignedToMemberId).toUpperCase());
      if (assignedMember?.email) {
        const completedSubject = `[MSS UEMK] Task Verified and Completed - ${updatedPayload.title}`;
        const completedHtml = `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #cbd5e1; border-radius: 14px; background-color: #0f172a; color: #eff6ff;">
            <h2 style="color: #38bdf8; margin-bottom: 8px;">✅ Task Verified and Completed</h2>
            <p style="font-size: 14px; line-height: 1.5; color: #e2e8f0;">Hello <strong>${assignedMember.name}</strong>,</p>
            <p style="font-size: 14px; line-height: 1.5; color: #e2e8f0;">Your task <strong>${updatedPayload.title}</strong> has been verified and marked as completed by the admin team.</p>
            <p style="font-size: 13px; line-height: 1.5; color: #bfdbfe;">Submission notes: ${updatedPayload.submissionNotes || 'No notes were added.'}</p>
            <p style="font-size: 12px; color: #94a3b8; margin-top: 18px;">Microsoft Student Society • UEM Kolkata Chapter</p>
          </div>`;
        await sendEmail(assignedMember.email, completedSubject, completedHtml);
      }
    }

    if (req.body.status === 'in_review' || req.body.submissionLink) {
        await createAdminNotification(`Member ${updatedPayload.assignedToMemberId} submitted task "${updatedPayload.title}".`, 'info');
    }

    res.json(updatedPayload);
  } catch (err) {
    res.status(500).json({ error: 'Database failed updating task brief.' });
  }
});

// ==========================================
// WORKABLE OTP & SIMULATED GOOGLE AUTH GATEWAY
// ==========================================

const activeOTPs = new Map<string, { otp: string; expiresAt: number }>();

// Endpoint to dispatch OTP to student college email
app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email parameter is required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes validity

    activeOTPs.set(cleanEmail, { otp, expiresAt });

    const mailSubject = `[MSS UEMK] ${otp} is your Chapter Authentication Code`;
    const mailHtml = `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 30px; border: 1px solid #1e293b; border-radius: 16px; background-color: #0b1329; color: #f8fafc; box-shadow: 0 10px 25px rgba(0,0,0,0.4);">
        <div style="text-align: center; border-bottom: 1px solid #334155; padding-bottom: 20px; margin-bottom: 24px;">
          <h2 style="color: #38bdf8; margin: 0; font-size: 20px; letter-spacing: 2px;">MICROSOFT STUDENT SOCIETY</h2>
          <p style="color: #64748b; margin: 5px 0 0 0; font-size: 11px; font-family: monospace;">UEM KOLKATA CHAPTER PORTAL DELEGATION</p>
        </div>
        
        <p style="font-size: 14px; line-height: 1.6; color: #cbd5e1;">Hello,</p>
        <p style="font-size: 14px; line-height: 1.6; color: #cbd5e1;">You requested an authorization code to verify your email address on our student society portal. Your secure OTP code is:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-family: monospace; display: inline-block; font-size: 36px; font-weight: 800; letter-spacing: 6px; color: #06b6d4; background-color: #0f172a; padding: 16px 36px; border-radius: 12px; border: 1px solid #0891b2; box-shadow: 0 0 15px rgba(6,182,212,0.15);">${otp}</span>
        </div>
        
        <p style="font-size: 11px; text-align: center; color: #64748b; line-height: 1.5;">This code will expire in <strong>5 minutes</strong>. If you did not initialize this action, please ignore this communication or contact microsoftstudentsocietyuemk@gmail.com.</p>
        
        <div style="border-top: 1px solid #1e293b; padding-top: 15px; margin-top: 25px; text-align: center;">
          <p style="font-size: 10px; color: #475569; margin: 0;">Automated Security Dispatch Token • MSS UEMK Cybersecurity Infrastructure</p>
        </div>
      </div>
    `;

    console.log(`[OTP Engine] Generated ${otp} for ${cleanEmail}. Expiration: 5m.`);
    
    // Attempt sending SMTP mail
    const mailSent = await sendEmail(cleanEmail, mailSubject, mailHtml);

    res.json({
      success: true,
      mailSent,
      message: mailSent 
        ? `Verification OTP sent successfully to ${cleanEmail}. Please check your spam folder/inbox if it doesn't arrive!`
        : `A secure verification OTP has been generated. Please check your registered email or contact admin if SMTP connectivity is offline.`
    });
  } catch (err: any) {
    console.error("[OTP Engine Error]", err);
    res.status(500).json({ error: 'Server OTP pipeline collapsed: ' + err.message });
  }
});

// Endpoint to verify OTP
app.post('/api/auth/verify-otp', (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP parameters are compulsory.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const record = activeOTPs.get(cleanEmail);

    if (!record) {
      return res.status(400).json({ error: 'No active OTP verification code was requested for this Address.' });
    }

    if (Date.now() > record.expiresAt) {
      activeOTPs.delete(cleanEmail);
      return res.status(400).json({ error: 'The verification code has expired. Please request a new OTP code.' });
    }

    if (record.otp !== otp.trim()) {
      return res.status(400).json({ error: 'Invalid verification code. Please inspect the code and try again.' });
    }

    // Success! Wipe code
    activeOTPs.delete(cleanEmail);
    res.json({ success: true, message: 'Email address verified successfully over secure OTP line!' });
  } catch (err: any) {
    res.status(500).json({ error: 'Verification module failure: ' + err.message });
  }
});

// Endpoint for Simulated Google sign-in/up matching
app.post('/api/auth/google', async (req, res) => {
  try {
    const { email, name, photoUrl, action } = req.body;
    if (!email || !name) {
      return res.status(400).json({ error: 'Google Credentials payload is corrupted.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const localData = getLocalData();

    // Check if member already exists in the team roster (local and direct DB)
    let foundMember = localData.team.find((m: any) => m.email && m.email.toLowerCase() === cleanEmail);
    if (!foundMember && isMongoConnected && mongoose.connection.readyState === 1) {
      try {
        foundMember = await TeamMemberModel.findOne({ email: new RegExp('^' + cleanEmail + '$', 'i') }).lean();
      } catch (dbErr) {
        console.error("Direct MongoDB check in Google Auth failed:", dbErr);
      }
    }

    if (action === 'login') {
      if (foundMember) {
        // Automatically issue session sequence matching
        assignMemberSequencesForArray(localData.team);
        
        await createAdminNotification(
          `Member ${foundMember.name} (ID: ${foundMember.memberId}) signed into the Organising Portal via Google SSO.`,
          'info'
        );

        return res.json({
          success: true,
          token: `mss-member-token-${foundMember.id}`,
          member: foundMember,
          isNewUser: false,
          message: `Welcome back, ${foundMember.name}! Authenticated effortlessly via Google Sign-In.`
        });
      } else {
        // Return structured parameters to switch tab to signup with Google details pre-filled!
        return res.json({
          success: false,
          isNewUser: true,
          email: cleanEmail,
          name,
          photoUrl: photoUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`,
          error: `No existing student roster found for ${cleanEmail}. We have auto-extracted your Google profile details. Click "Request Profile Signup" to proceed with pre-filled fields.`
        });
      }
    } else {
      // Sign-up action
      let emailFoundInTeam = !!foundMember;
      let emailFoundInPending = localData.pendingMembers.some((m: any) => m.email && m.email.toLowerCase() === cleanEmail);

      if (isMongoConnected && mongoose.connection.readyState === 1) {
        try {
          const dbTeamExists = await TeamMemberModel.findOne({ email: new RegExp('^' + cleanEmail + '$', 'i') });
          const dbPendingExists = await PendingMemberModel.findOne({ email: new RegExp('^' + cleanEmail + '$', 'i') });
          if (dbTeamExists) emailFoundInTeam = true;
          if (dbPendingExists) emailFoundInPending = true;
        } catch (dbErr) {
          console.error("Direct MongoDB check in Google signup action failed:", dbErr);
        }
      }

      if (emailFoundInTeam) {
        return res.status(400).json({ error: 'This email address is already linked to an active chapter profile.' });
      }

      if (emailFoundInPending) {
        return res.status(400).json({ error: 'A registration application for this profile is already nested inside the queue.' });
      }

      // Automatically register a standard profile!
      const payload = {
        id: 'pending_' + Date.now().toString(),
        name,
        email: cleanEmail,
        title: 'Core Technology Associate',
        category: 'student_member',
        photoUrl: photoUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`,
        linkedinUrl: 'https://linkedin.com/in/' + name.toLowerCase().replace(/\s+/g, '-'),
        instagramUrl: '',
        sortOrder: 10,
        submittedAt: new Date().toISOString()
      };

      await runDbQuery(
        async () => {
          const newPending = new PendingMemberModel(payload);
          await newPending.save();
        },
        () => {}
      );

      localData.pendingMembers.push(payload);
      saveLocalData(localData);

      await createAdminNotification(
        `New portal registration via Google Auth: ${name} (${cleanEmail})`,
        'new_join'
      );

      // Trigger congratulatory mail dispatch
      const signupMailSubject = `[MSS UEMK Portal] Google Registration Registered Safely`;
      const signupMailHtml = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #1e293b; border-radius: 12px; background-color: #0f172a; color: #f8fafc;">
          <h2 style="color: #38bdf8; margin-bottom: 12px;">✅ Google Account Synced</h2>
          <p style="font-size: 14px; color: #94a3b8;">Hello <strong>${name}</strong>,</p>
          <p style="font-size: 14px; color: #cbd5e1; line-height: 1.5;">You have successfully initialized your profile registration using <strong>Google Sign-Up</strong>:</p>
          <div style="background-color: #1e293b; padding: 14px; border-radius: 8px; font-family: monospace; font-size: 13px; color: #06b6d4; line-height: 1.6; margin: 16px 0; border-left: 4px solid #38bdf8;">
            <strong>Target Name:</strong> ${name}<br/>
            <strong>Synced Outlook/Google Mail:</strong> ${cleanEmail}<br/>
            <strong>Role Title:</strong> Student Associate (Technology Division)<br/>
            <strong>Category:</strong> Student Member
          </div>
          <p style="font-size: 13px; color: #94a3b8; line-height: 1.5;">Our operations team reviews submissions daily. Once approved, you can authenticate instantly using either Google Login or your generated Sequence ID.</p>
          <p style="font-size: 10px; color: #475569; text-align: center; margin-top: 30px; border-top: 1px solid #1e293b; padding-top: 15px;">Automated security node • MSS UEMK Chapter</p>
        </div>
      `;
      await sendEmail(cleanEmail, signupMailSubject, signupMailHtml);

      return res.json({
        success: true,
        message: `Registered successfully with your Google Account! Your application has been logged inside our validation pipeline. Once admins approve your profile, you will receive a notification and can login seamlessly.`
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: 'Google authenticate endpoint failure: ' + err.message });
  }
});

app.delete('/api/tasks/:id', checkAdminAuth, async (req, res) => {
  try {
    const localData = getLocalData();
    const index = localData.tasks.findIndex((t) => String(t.id) === req.params.id || String(t._id) === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Assigned task not found.' });
    }

    await runDbQuery(
      async () => {
        await TaskModel.deleteMany({ $or: [{ id: req.params.id }, ...(mongoose.Types.ObjectId.isValid(req.params.id) ? [{ _id: req.params.id }] : [])] });
      },
      () => {}
    );

    localData.tasks.splice(index, 1);
    saveLocalData(localData);

    res.json({ success: true, message: 'Assigned task wiped successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Database failed core delete on task.' });
  }
});

// ==========================================
// GEMINI INTELLIGENT COMPANION CO-PILOT API
// ==========================================

let aiClient: GoogleGenAI | null = null;
function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined in system environment secrets. Please set it in Settings > Secrets.');
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

const CO_PILOT_SYSTEM_INSTRUCTION = `
You are the Official AI Co-pilot of the Microsoft Student Society (MSS) Chapter at University of Engineering & Management, Kolkata (UEMK).
Your purpose is to answer any technical, organizational, or academic questions regarding the MSS UEMK chapter.

Key Context & Chapter Details:
- Campus Host: University of Engineering & Management, Kolkata (UEMK).
- Address: University Area, Plot No III-B/5, Action Area III, New Town, Kolkata, West Bengal 700160.
- Email: microsoftstudentsocietyuemk@gmail.com
- Faculty Advisor: Prof. Dr. Abhishek Bhattacharya (Faculty Advisor & CSE Department Head).
- Student Leadership:
  * Sayak Sg - Student Chairperson
  * Ananya Sen - Vice Chairperson & Operations Lead
  * Rahul Dev - Technical Lead & Cloud Specialist
  * Siddharth Roy - Dedicated Student Roster Member (Awarded the "Best Working Member Elite" badge for his exquisite contribution).
- Core Departments / Specialized Divisions:
  1. Technical Development (contribute to student utilities, Azure web stacks, models, sandbox APIs)
  2. UI/UX Design (visual wireframes, custom illustrations, branding, typography)
  3. Public Relations (PR) (brand collaborations, host external outreach, manage social lines)
  4. Logistics & Event Management (coordinate room keys, certification verification codes, seminar workflows)
  5. Content Strategy & Writing (course README blocks, blog posts, formal invitation briefs)
- Prominent Events:
  * [UPCOMING] "Microsoft Azure Cloud Foundations" scheduled for June 15, 2026 (14:00 - 17:00 IST) at Main Auditorium, UEM Kolkata. Covers cloud orchestration, Storage accounts, virtual machines.
  * [PAST] "Generative AI Hackathon with Gemini APIs" held on May 10, 2026 at Big Data Research Lab. Focuses on full-stack web solutions.
- Student Repositories & Projects:
  * "Smart Campus Advisory Assistant": full-stack advisory chatbot using Gemini API.
  * "Cloud-native Attendance & Identity Engine": Classroom attendance logs running on Azure Cognitive Services and MongoDB.
- Student Recruitment:
  * Student recruitment for 2026 is officially open! The section is "Pioneer Ingress" (Join Section). Freshman, sophomores, juniors are invited to apply for alignment in their favorite divisions.
  * Contact inquiry or sponsor proposals can be submitted dynamically through "Establish Inbound Link" (Contact Section).

Response Style Instructions:
- Adopt a professional, futuristic, yet warm, highly supportive tech-expert helper persona.
- Keep responses compact, elegant, and structured with concise headers and list bullets.
- Always output using beautiful Markdown formatting. Use bold text, tables, code blocks, or checklists if helpful.
- Gently remind user that they can join the chapter via the recruitment form or connect via the contact form on this very page!
- Do not mention key configuration or internal API keys.
`;

function buildFallbackCopilotReply(message: string) {
  const clean = String(message || '').trim();
  return `I’m here to help with MSS UEMK updates. Based on your message, I can assist with chapter activities, member portal guidance, event coordination, and recruitment information.\n\nYou asked: "${clean}"\n\nIf you want, I can also help you draft a quick response, summarize a task, or explain the portal flow. Please try again after the AI key is configured if you need deeper generation.`;
}

app.post('/api/gemini/chat', async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Missing required query string or 'message' property." });
    }

    let ai: GoogleGenAI | null = null;
    try {
      ai = getAiClient();
    } catch (aiInitErr: any) {
      console.warn('[Gemini Co-pilot API] Falling back to static response because GEMINI_API_KEY is not available:', aiInitErr.message);
      return res.json({ text: buildFallbackCopilotReply(message) });
    }

    // Map incoming history to contents array structure for generateContent
    // Each element in contents: { role: 'user' | 'model', parts: [{ text: string }] }
    const contents: any[] = [];
    
    if (Array.isArray(history)) {
      history.forEach((h: any) => {
        if (h.role && h.text) {
          contents.push({
            role: h.role === 'client' || h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.text }]
          });
        }
      });
    }

    // Append the current message
    contents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: contents,
      config: {
        systemInstruction: CO_PILOT_SYSTEM_INSTRUCTION,
        temperature: 0.8,
        topP: 0.95,
      }
    });

    const text = response?.text || buildFallbackCopilotReply(message);
    res.json({ text });
  } catch (err: any) {
    console.error("[Gemini Co-pilot API Error]", err);
    res.json({ text: buildFallbackCopilotReply(String(req.body?.message || '')) });
  }
});

// ==========================================
// STATIC BUILD ENGINE & COLD VITE INTEGRATIONS
// ==========================================

async function startServer() {
  // On Vercel (production), serve static files only
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Express Node Server] Server booted at: http://0.0.0.0:${PORT}`);
  });
}

// Export app for serverless functions (Vercel)
export default app;

// Only start server locally (not on Vercel)
if (process.env.VERCEL !== '1' && !process.env.VERCEL_URL) {
  startServer();
}
