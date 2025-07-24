interface Feedback {
  id: string;
  interviewId: string;
  totalScore: number;
  categoryScores: Array<{
    name: string;
    score: number;
    comment: string;
  }>;
  strengths: string[];
  areasForImprovement: string[];
  finalAssessment: string;
  createdAt: string;
}

interface Interview {
  id: string;
  role: string;
  level: string;
  questions: string[];
  techstack: string[];
  createdAt: string;
  userId: string;
  type: string;
  finalized: boolean;
  targetColleges?: string[];
  targetBranches?: string[];
  targetYears?: number[];
  coverImage?: string;
}

interface CreateFeedbackParams {
  interviewId: string;
  userId: string;
  transcript: { role: string; content: string }[];
  feedbackId?: string;
}

interface User {
  name: string;
  email: string;
  id: string;
  college?: string;
  branch?: string;
  year?: string; // Keep as string since it's stored as string in Firebase
  profileURL?: string;
}

interface College {
  id: string;
  name: string;
  branches: string[];
  years: number[];
  tpoUserId: string;
}

interface InterviewCardProps {
  interviewId?: string;
  userId?: string;
  role: string;
  type: string;
  techstack: string[];
  createdAt?: string;
}

interface AgentProps {
  userName: string;
  userId?: string;
  interviewId?: string;
  feedbackId?: string;
  type: "generate" | "interview";
  questions?: string[];
  profileImage?: string;
}

interface RouteParams {
  params: Promise<Record<string, string>>;
  searchParams: Promise<Record<string, string>>;
}

interface GetFeedbackByInterviewIdParams {
  interviewId: string;
  userId: string;
}

interface GetLatestInterviewsParams {
  userId: string;
  limit?: number;
}

interface SignInParams {
  email: string;
  idToken: string;
}

interface SignUpParams {
  uid: string;
  name: string;
  email: string;
  password: string;
  college?: string;
  branch?: string;
  year?: string;
}

type FormType = "sign-in" | "sign-up";

interface InterviewFormProps {
  interviewId: string;
  role: string;
  level: string;
  type: string;
  techstack: string[];
  amount: number;
}

interface TechIconProps {
  techStack: string[];
}

interface GenerateInterviewParams {
  role: string;
  level: "Junior" | "Mid-level" | "Senior" | "Lead";
  type: "Technical" | "Behavioral" | "Mixed";
  techstack: string[] | string;
  amount: number;
  userid: string;
  targetColleges?: string[];
  targetBranches?: string[];
  targetYears?: number[];
}

interface InterviewAttempt {
  id: string;
  interviewId: string;
  userId: string;
  studentName: string;
  studentEmail: string;
  totalScore: number;
  createdAt: string;
}

interface CollegeFilters {
  college?: string;
  branch?: string;
  year?: string;
}

interface TPOReportParams {
  collegeId: string;
  branch?: string;
  year?: string;
}

interface StudentFeedbackData {
  feedbackId: string;
  studentName: string;
  studentEmail: string;
  totalScore: number;
  attemptDate: string;
  college: string;
  branch: string;
  year: string;
}
