// Removed VAPI dependency - using our open-source solution
import { z } from "zod";
import { ConversationConfig } from "../types/conversation";

export const mappings = {
  "react.js": "react",
  reactjs: "react",
  react: "react",
  "next.js": "nextjs",
  nextjs: "nextjs",
  next: "nextjs",
  "vue.js": "vuejs",
  vuejs: "vuejs",
  vue: "vuejs",
  "express.js": "express",
  expressjs: "express",
  express: "express",
  "node.js": "nodejs",
  nodejs: "nodejs",
  node: "nodejs",
  mongodb: "mongodb",
  mongo: "mongodb",
  mongoose: "mongoose",
  mysql: "mysql",
  postgresql: "postgresql",
  sqlite: "sqlite",
  firebase: "firebase",
  docker: "docker",
  kubernetes: "kubernetes",
  aws: "aws",
  azure: "azure",
  gcp: "gcp",
  digitalocean: "digitalocean",
  heroku: "heroku",
  photoshop: "photoshop",
  "adobe photoshop": "photoshop",
  html5: "html5",
  html: "html5",
  css3: "css3",
  css: "css3",
  sass: "sass",
  scss: "sass",
  less: "less",
  tailwindcss: "tailwindcss",
  tailwind: "tailwindcss",
  bootstrap: "bootstrap",
  jquery: "jquery",
  typescript: "typescript",
  ts: "typescript",
  javascript: "javascript",
  js: "javascript",
  "angular.js": "angular",
  angularjs: "angular",
  angular: "angular",
  "ember.js": "ember",
  emberjs: "ember",
  ember: "ember",
  "backbone.js": "backbone",
  backbonejs: "backbone",
  backbone: "backbone",
  nestjs: "nestjs",
  graphql: "graphql",
  "graph ql": "graphql",
  apollo: "apollo",
  webpack: "webpack",
  babel: "babel",
  "rollup.js": "rollup",
  rollupjs: "rollup",
  rollup: "rollup",
  "parcel.js": "parcel",
  parceljs: "parcel",
  npm: "npm",
  yarn: "yarn",
  git: "git",
  github: "github",
  gitlab: "gitlab",
  bitbucket: "bitbucket",
  figma: "figma",
  prisma: "prisma",
  redux: "redux",
  flux: "flux",
  redis: "redis",
  selenium: "selenium",
  cypress: "cypress",
  jest: "jest",
  mocha: "mocha",
  chai: "chai",
  karma: "karma",
  vuex: "vuex",
  "nuxt.js": "nuxt",
  nuxtjs: "nuxt",
  nuxt: "nuxt",
  strapi: "strapi",
  wordpress: "wordpress",
  contentful: "contentful",
  netlify: "netlify",
  vercel: "vercel",
  "aws amplify": "amplify",
};

export const interviewer: ConversationConfig = {
  systemPrompt: `You are a professional job interviewer conducting a real-time voice interview with a candidate. Your goal is to assess their qualifications, motivation, and fit for the role.

Interview Guidelines:
Follow the structured question flow:
{{questions}}

Engage naturally & react appropriately:
Listen actively to responses and acknowledge them before moving forward.
Ask brief follow-up questions if a response is vague or requires more detail.
Keep the conversation flowing smoothly while maintaining control.
Be professional, yet warm and welcoming:

Use official yet friendly language.
Keep responses concise and to the point (like in a real voice interview).
Avoid robotic phrasing—sound natural and conversational.

Handle unprofessional behavior with ZERO TOLERANCE:
If a candidate uses profanity, sexual language, inappropriate comments, or behaves unprofessionally:
- Issue an IMMEDIATE, FIRM warning without any politeness or apologies
- Be direct, authoritative, and assertive - you are in complete control
- NEVER say "I apologize" or "I understand you're frustrated" - DO NOT make excuses for their behavior
- Make it clear this behavior is completely unacceptable and will result in interview termination
- Examples of firm responses:
  * "That language is completely unacceptable in a professional interview. This is your first warning. Any further inappropriate behavior will result in immediate termination of this interview."
  * "Your behavior is unprofessional and inappropriate. This is your second warning. One more incident and this interview will be terminated immediately."
  * "This interview is being terminated due to your continued inappropriate behavior. This is unacceptable in any professional setting."
- Track warnings internally and terminate after the third offense
- Do NOT continue with interview questions after giving a warning - wait for their response first

Handle company-specific questions with strict boundaries:
- For salary, compensation, benefits: "I cannot provide specific compensation information. HR will discuss all compensation details during the next phase if you advance."
- For company policies, specific benefits, work environment: "I'm not authorized to discuss those specifics. HR will provide comprehensive information about company policies and culture."
- For role responsibilities: You can discuss general job duties and what the role typically involves
- CRITICAL: NEVER make up or invent specific salary figures, benefit amounts, company policies, or organizational details
- If you don't know something specific about the company, always redirect to HR or state you cannot provide that information
- NEVER hallucinate or create fictional company information

Conclude the interview properly:
Thank the candidate for their time.
Inform them that the company will reach out soon with feedback.
End the conversation on a polite and positive note.

CRITICAL RESPONSE RULES:
- Be firm and authoritative when dealing with misconduct - you control this interview
- Keep responses short and direct for voice conversation
- NEVER include stage directions, parenthetical notes, or bracketed commentary
- Speak only what should be heard - no internal thoughts or directions
- Do not apologize for candidate misconduct - be firm and professional instead
- Do not invent or hallucinate any company-specific information
- Be honest when you don't know specific details about the company or role`,
  useStreaming: true, // 🚀 Enable streaming for optimized performance
};

export const feedbackSchema = z.object({
  totalScore: z.union([z.number(), z.string()]), // Allow "Cannot be determined"
  categoryScores: z.tuple([
    z.object({
      name: z.literal("Communication Skills"),
      score: z.union([z.number(), z.string()]), // Allow "Cannot be determined"
      comment: z.string(),
    }),
    z.object({
      name: z.literal("Technical Knowledge"),
      score: z.union([z.number(), z.string()]), // Allow "Cannot be determined"
      comment: z.string(),
    }),
    z.object({
      name: z.literal("Problem Solving"),
      score: z.union([z.number(), z.string()]), // Allow "Cannot be determined"
      comment: z.string(),
    }),
    z.object({
      name: z.literal("Cultural Fit"),
      score: z.union([z.number(), z.string()]), // Allow "Cannot be determined"
      comment: z.string(),
    }),
    z.object({
      name: z.literal("Confidence and Clarity"),
      score: z.union([z.number(), z.string()]), // Allow "Cannot be determined"
      comment: z.string(),
    }),
  ]),
  strengths: z.array(z.string()),
  areasForImprovement: z.array(z.string()),
  finalAssessment: z.string(),
});

export const interviewCovers = [
  "/adobe.png",
  "/amazon.png",
  "/facebook.png",
  "/hostinger.png",
  "/pinterest.png",
  "/quora.png",
  "/reddit.png",
  "/skype.png",
  "/spotify.png",
  "/telegram.png",
  "/tiktok.png",
  "/yahoo.png",
];

export const dummyInterviews: Interview[] = [
  {
    id: "1",
    userId: "user1",
    role: "Frontend Developer",
    type: "Technical",
    techstack: ["React", "TypeScript", "Next.js", "Tailwind CSS"],
    level: "Junior",
    questions: ["What is React?"],
    finalized: false,
    createdAt: "2024-03-15T10:00:00Z",
  },
  {
    id: "2",
    userId: "user1",
    role: "Full Stack Developer",
    type: "Mixed",
    techstack: ["Node.js", "Express", "MongoDB", "React"],
    level: "Senior",
    questions: ["What is Node.js?"],
    finalized: false,
    createdAt: "2024-03-14T15:30:00Z",
  },
];
