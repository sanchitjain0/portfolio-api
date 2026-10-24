import mongoose, { Schema, type InferSchemaType } from 'mongoose'

const DAY = 24 * 60 * 60

/* ── contact form messages (kept until you delete them) ─────────────────────── */
const contactSchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 80 },
    email: { type: String, required: true, maxlength: 200 },
    message: { type: String, required: true, maxlength: 5000 },
    status: { type: String, enum: ['new', 'read', 'replied', 'archived', 'spam'], default: 'new', index: true },
    note: { type: String, default: '', maxlength: 2000 },
    ipHash: String,
    userAgent: { type: String, maxlength: 300 },
  },
  { timestamps: true },
)
contactSchema.index({ createdAt: -1 })

/* ── "Ask my portfolio" questions (auto-deleted after 90 days) ──────────────── */
const chatLogSchema = new Schema(
  {
    question: { type: String, required: true, maxlength: 500 },
    answer: { type: String, required: true },
    matchedId: { type: String, default: null },
    flagged: { type: Boolean, default: false, index: true },
    ipHash: String,
    createdAt: { type: Date, default: Date.now, expires: 90 * DAY },
  },
  { versionKey: false },
)

/* ── demo orders from the architecture section (30 days) ────────────────────── */
const demoOrderSchema = new Schema(
  {
    orderId: { type: String, required: true },
    source: { type: String, enum: ['kiosk', 'web'], required: true },
    city: { type: String, maxlength: 60 },
    ipHash: String,
    createdAt: { type: Date, default: Date.now, expires: 30 * DAY },
  },
  { versionKey: false },
)

/* ── anonymous analytics events (90 days) ────────────────────────────────────── */
export const EVENT_TYPES = ['page_view', 'section_view', 'resume_download', 'theme_toggle', 'room_click', 'outbound_click', 'project_reaction'] as const
const eventSchema = new Schema(
  {
    type: { type: String, enum: EVENT_TYPES, required: true, index: true },
    label: { type: String, maxlength: 80 },
    path: { type: String, maxlength: 120 },
    referrer: { type: String, maxlength: 120 },
    device: { type: String, enum: ['mobile', 'desktop'] },
    visitorHash: String,
    createdAt: { type: Date, default: Date.now, expires: 90 * DAY },
  },
  { versionKey: false },
)
eventSchema.index({ type: 1, createdAt: -1 })

/* ── guestbook (moderated: only approved notes are public) ───────────────────── */
const guestbookSchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 40 },
    message: { type: String, required: true, maxlength: 280 },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    ipHash: String,
  },
  { timestamps: true },
)

/* ── project reactions: one ❤ per visitor per project ────────────────────────── */
const reactionSchema = new Schema(
  {
    project: { type: String, required: true, maxlength: 60 },
    visitorHash: { type: String, required: true },
  },
  { timestamps: true },
)
reactionSchema.index({ project: 1, visitorHash: 1 }, { unique: true })

/* ── site config editable from the dashboard (single document) ──────────────── */
const siteConfigSchema = new Schema(
  {
    key: { type: String, default: 'site', unique: true },
    available: { type: Boolean, default: true },
    availabilityText: { type: String, default: 'Open to senior backend and full-stack roles', maxlength: 120 },
    currentlyWorkingOn: { type: String, default: '', maxlength: 160 },
    banner: {
      enabled: { type: Boolean, default: false },
      text: { type: String, default: '', maxlength: 160 },
      link: { type: String, default: '', maxlength: 300 },
    },
    guestbookEnabled: { type: Boolean, default: true },
  },
  { timestamps: true },
)

/* ── knowledge base for the local "Ask my portfolio" answers ─────────────────── */
const knowledgeSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, maxlength: 60 },
    question: { type: String, required: true, maxlength: 200 },
    keywords: { type: [String], default: [] },
    answer: { type: String, required: true, maxlength: 1200 },
    enabled: { type: Boolean, default: true },
    hits: { type: Number, default: 0 },
  },
  { timestamps: true },
)

/* ── admin audit trail (logins, edits) – 180 days ───────────────────────────── */
const auditSchema = new Schema(
  {
    action: { type: String, required: true, maxlength: 60 },
    detail: { type: String, maxlength: 300 },
    ipHash: String,
    success: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now, expires: 180 * DAY },
  },
  { versionKey: false },
)

export const Contact = mongoose.model('Contact', contactSchema)
export const ChatLog = mongoose.model('ChatLog', chatLogSchema)
export const DemoOrder = mongoose.model('DemoOrder', demoOrderSchema)
export const Event = mongoose.model('Event', eventSchema)
export const Guestbook = mongoose.model('Guestbook', guestbookSchema)
export const Reaction = mongoose.model('Reaction', reactionSchema)
export const SiteConfig = mongoose.model('SiteConfig', siteConfigSchema)
export const Knowledge = mongoose.model('Knowledge', knowledgeSchema)
export const Audit = mongoose.model('Audit', auditSchema)

export type SiteConfigDoc = InferSchemaType<typeof siteConfigSchema>
export type KnowledgeDoc = InferSchemaType<typeof knowledgeSchema>
