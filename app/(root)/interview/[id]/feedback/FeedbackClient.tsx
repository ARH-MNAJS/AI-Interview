"use client";

import dayjs from "dayjs";
import Link from "next/link";
import { useState, useRef } from "react";
import { 
  Download, 
  MessageSquare, 
  X, 
  Star, 
  Calendar,
  MessageCircle,
  Brain,
  Puzzle,
  Users,
  Eye,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Lightbulb
} from "lucide-react";
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer } from 'recharts';

import { Button } from "@/components/ui/button";

// Helper function to display total score
const displayTotalScore = (score: number | string): JSX.Element => {
  if (typeof score === 'string') {
    return (
      <span className="text-yellow-400 font-bold text-3xl">
        {score}
      </span>
    );
  }
  return (
    <span className="text-primary-200 font-bold text-3xl">
      {score}
    </span>
  );
};

// Helper function to format scores
const formatScore = (score: number | string): string => {
  if (typeof score === 'string') {
    return score; // "Cannot be determined"
  }
  return `${score}/100`;
};

// Category icons mapping
const getCategoryIcon = (categoryName: string) => {
  switch (categoryName) {
    case "Communication Skills":
      return <MessageCircle className="w-5 h-5" />;
    case "Technical Knowledge":
      return <Brain className="w-5 h-5" />;
    case "Problem Solving":
      return <Puzzle className="w-5 h-5" />;
    case "Cultural Fit":
      return <Users className="w-5 h-5" />;
    case "Confidence and Clarity":
      return <Eye className="w-5 h-5" />;
    default:
      return <Star className="w-5 h-5" />;
  }
};

// Convert category scores for radar chart
const prepareChartData = (categoryScores: any[]) => {
  return categoryScores.map(category => ({
    category: category.name.replace(" ", "\n"),
    score: typeof category.score === 'number' ? category.score : 0,
    fullMark: 100
  }));
};



// Get color based on score
const getScoreColor = (score: number | string): string => {
  if (typeof score === 'string') return '#6b7280'; // gray for "Cannot be determined"
  if (score >= 80) return '#10b981'; // green
  if (score >= 60) return '#f59e0b'; // yellow
  if (score >= 40) return '#f97316'; // orange
  return '#ef4444'; // red
};

interface ConversationMessage {
  role: string;
  content: string;
  timestamp?: string;
}

interface ConversationModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversation: ConversationMessage[];
}

const ConversationModal = ({ isOpen, onClose, conversation }: ConversationModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl border border-border max-w-4xl w-full max-h-[80vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Interview Conversation
          </h2>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-accent rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          <div className="space-y-4">
            {conversation.length > 0 ? (
              conversation.map((message, index) => (
                <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] rounded-lg p-4 ${
                    message.role === 'user' 
                      ? 'bg-primary-200 text-black' 
                      : 'bg-muted text-foreground border border-border'
                  }`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium opacity-70">
                        {message.role === 'user' ? 'You' : 'Interviewer'}
                      </span>
                      {message.timestamp && (
                        <span className="text-xs opacity-50">
                          {dayjs(message.timestamp).format("HH:mm:ss")}
                        </span>
                      )}
                    </div>
                    <p className="text-sm leading-relaxed">{message.content}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center text-muted-foreground py-8">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No conversation data available</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface FeedbackClientProps {
  feedback: any;
  interview: any;
  isTPO: boolean;
  interviewId: string;
}

const FeedbackClient = ({ feedback, interview, isTPO, interviewId }: FeedbackClientProps) => {
  const [showConversation, setShowConversation] = useState(false);
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const fetchConversation = async () => {
    setLoadingConversation(true);
    try {
      const response = await fetch(`/api/interview-conversation/${interviewId}`);
      const data = await response.json();
      
      if (data.success) {
        setConversation(data.conversation);
      } else {
        console.error('Failed to fetch conversation:', data.error);
        setConversation([]);
      }
    } catch (error) {
      console.error('Error fetching conversation:', error);
      setConversation([]);
    } finally {
      setLoadingConversation(false);
    }
  };

  const handleShowConversation = () => {
    setShowConversation(true);
    if (conversation.length === 0) {
      fetchConversation();
    }
  };

  const downloadReport = async () => {
    if (!reportRef.current) return;

    try {
      // Create a new window for printing
      const printWindow = window.open('', '_blank', 'width=800,height=600');
      
      if (!printWindow) {
        alert('Please allow popups to download the PDF');
        return;
      }

      // Get the HTML content
      const content = reportRef.current.innerHTML;
      
      // Create the print document with proper styling
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Interview Feedback Report</title>
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              background-color: #020408;
              color: white;
              padding: 20px;
              line-height: 1.6;
            }
            
            .bg-card {
              background-color: #27282f !important;
              border: 1px solid rgba(255, 255, 255, 0.1) !important;
              border-radius: 12px;
              padding: 24px;
              margin-bottom: 16px;
            }
            
            .bg-muted {
              background-color: #242633 !important;
              border-radius: 8px;
              padding: 16px;
            }
            
            .text-foreground {
              color: #ffffff !important;
            }
            
            .text-muted-foreground {
              color: #a1a1aa !important;
            }
            
            .text-primary-200 {
              color: #cac5fe !important;
            }
            
            .text-green-400 {
              color: #4ade80 !important;
            }
            
            .text-orange-400 {
              color: #fb923c !important;
            }
            
            .text-blue-400 {
              color: #60a5fa !important;
            }
            
            .text-yellow-400 {
              color: #facc15 !important;
            }
            
            /* Grid layouts for print */
            .grid {
              display: grid;
            }
            
            .grid-cols-1 {
              grid-template-columns: repeat(1, minmax(0, 1fr));
            }
            
            .lg\\:grid-cols-2 {
              grid-template-columns: repeat(2, minmax(0, 1fr));
            }
            
            .gap-4 {
              gap: 16px;
            }
            
            .mb-4 {
              margin-bottom: 16px;
            }
            
            .p-6 {
              padding: 24px;
            }
            
            .rounded-xl {
              border-radius: 12px;
            }
            
            .border {
              border-width: 1px;
            }
            
            .flex {
              display: flex;
            }
            
            .items-center {
              align-items: center;
            }
            
            .justify-between {
              justify-content: space-between;
            }
            
            .gap-3 {
              gap: 12px;
            }
            
            .text-2xl {
              font-size: 24px;
            }
            
            .text-xl {
              font-size: 20px;
            }
            
            .text-lg {
              font-size: 18px;
            }
            
            .text-sm {
              font-size: 14px;
            }
            
            .font-semibold {
              font-weight: 600;
            }
            
            .font-bold {
              font-weight: 700;
            }
            
            .space-y-3 > * + * {
              margin-top: 12px;
            }
            
                         /* Hide charts in print as they might not render properly */
             .recharts-wrapper {
               display: none;
             }
             
             /* Progress bar styles for print */
             .bg-gray-700 {
               background-color: #374151 !important;
             }
             
             .space-y-2 > * + * {
               margin-top: 8px;
             }
             
             .space-y-4 > * + * {
               margin-top: 16px;
             }
            
            /* Make sure icons don't break */
            svg {
              width: 20px;
              height: 20px;
              fill: currentColor;
            }
            
            @media print {
              body {
                background-color: #020408 !important;
                -webkit-print-color-adjust: exact;
                color-adjust: exact;
              }
              
              .bg-card {
                background-color: #27282f !important;
                border: 1px solid rgba(255, 255, 255, 0.1) !important;
              }
              
              .bg-muted {
                background-color: #242633 !important;
              }
            }
          </style>
        </head>
        <body>
          <div style="max-width: 1200px; margin: 0 auto;">
            <div style="text-align: center; margin-bottom: 32px;">
              <h1 style="font-size: 32px; font-weight: bold; margin-bottom: 16px; background: linear-gradient(to right, #cac5fe, #60a5fa); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
                Interview Feedback Report
              </h1>
              <p style="font-size: 20px; color: #a1a1aa;">
                ${interview.role} • ${interview.level} Level
              </p>
            </div>
            ${content}
          </div>
        </body>
        </html>
      `);
      
      printWindow.document.close();
      
      // Wait for content to load
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
        
        // Close the window after printing
        setTimeout(() => {
          printWindow.close();
        }, 1000);
      }, 500);
      
    } catch (error) {
      console.error('Error generating PDF:', error);
    }
  };

  const chartData = feedback?.categoryScores ? prepareChartData(feedback.categoryScores) : [];
  const hasNumericScores = feedback?.categoryScores?.some((cat: any) => typeof cat.score === 'number');

  return (
    <div className="min-h-screen bg-background text-foreground relative pattern">
      {/* Background pattern - using the site's pattern class */}
      <div className="relative z-10">
        <div className="max-w-7xl mx-auto px-6 py-8">
          {/* Header */}
          <div className="text-center mb-6">
            <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-primary-200 to-blue-400 bg-clip-text text-transparent">
              Interview Feedback Report
            </h1>
            <p className="text-xl text-muted-foreground capitalize">
              {interview.role} • {interview.level} Level
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-center gap-4 mb-6">
            <Button 
              onClick={downloadReport}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg flex items-center gap-2 transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              <Download className="w-4 h-4" />
              Download Report
            </Button>
            <Button 
              onClick={handleShowConversation}
              disabled={loadingConversation}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white px-6 py-3 rounded-lg flex items-center gap-2 transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              <MessageSquare className="w-4 h-4" />
              {loadingConversation ? 'Loading...' : 'View Conversation'}
            </Button>
          </div>

          {/* Main Report Content */}
          <div ref={reportRef} className="bg-background p-6">
            {/* Overall Score Card */}
            <div className="bg-card rounded-xl border border-border p-6 mb-4">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Star className="w-8 h-8 text-yellow-400" />
                  <h2 className="text-2xl font-semibold">Overall Performance</h2>
                </div>
                <div className="flex items-center gap-3 text-muted-foreground">
                  <Calendar className="w-5 h-5" />
                  <span>
                    {feedback?.createdAt
                      ? dayjs(feedback.createdAt).format("MMM D, YYYY h:mm A")
                      : "N/A"}
                  </span>
                </div>
              </div>
              
              <div className="flex items-center justify-center mb-6">
                <div className="text-center">
                  <div className="mb-2">
                    {displayTotalScore(feedback?.totalScore)}
                    {typeof feedback?.totalScore === 'number' && (
                      <span className="text-muted-foreground text-xl ml-1">/100</span>
                    )}
                  </div>
                  <p className="text-muted-foreground text-sm">Overall Score</p>
                </div>
              </div>

              {/* Final Assessment */}
              <div className="bg-muted rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-blue-400" />
                  Assessment Summary
                </h3>
                <p className="text-foreground leading-relaxed">{feedback?.finalAssessment}</p>
              </div>
            </div>

            {/* Performance Chart & Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              {/* Radar Chart */}
              {hasNumericScores && (
                <div className="bg-card rounded-xl border border-border p-6 flex flex-col">
                  <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-primary-200" />
                    Performance Overview
                  </h3>
                  <div className="h-80 mb-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={chartData}>
                        <PolarGrid 
                          stroke="#374151" 
                          strokeWidth={1.5}
                          strokeOpacity={0.6}
                        />
                        <PolarAngleAxis 
                          dataKey="category" 
                          tick={{ 
                            fontSize: 10, 
                            fill: '#d1d5db',
                            fontWeight: 500
                          }}
                        />
                        <PolarRadiusAxis 
                          angle={90} 
                          domain={[0, 100]} 
                          tick={{ 
                            fontSize: 8, 
                            fill: '#9ca3af' 
                          }}
                          strokeOpacity={0.3}
                        />
                        <Radar
                          name="Score"
                          dataKey="score"
                          stroke="#ffd700"
                          fill="#ffd700"
                          fillOpacity={0.15}
                          strokeWidth={2.5}
                          dot={{ fill: '#ffd700', strokeWidth: 2, r: 4 }}
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                  
                  {/* Horizontal Progress Bars */}
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
                      <Star className="w-5 h-5 text-primary-200" />
                      Category Scores
                    </h3>
                    <div className="space-y-4">
                      {feedback?.categoryScores?.map((category: any, index: number) => {
                        const score = typeof category.score === 'number' ? category.score : 0;
                        const scoreColor = getScoreColor(category.score);
                        
                        return (
                          <div key={index} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-foreground">
                                {category.name}
                              </span>
                              <span className="text-sm font-bold text-foreground">
                                {typeof category.score === 'number' ? `${category.score}%` : category.score}
                              </span>
                            </div>
                            <div className="w-full bg-gray-700 rounded-full h-3">
                              <div 
                                className="h-3 rounded-full transition-all duration-300 ease-out"
                                style={{ 
                                  width: `${score}%`,
                                  backgroundColor: scoreColor 
                                }}
                              ></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Category Breakdown */}
              <div className="bg-card rounded-xl border border-border p-6">
                <h3 className="text-xl font-semibold mb-4">Category Breakdown</h3>
                <div className="space-y-3">
                  {feedback?.categoryScores?.map((category: any, index: number) => (
                    <div key={index} className="bg-muted rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className="text-primary-200">
                            {getCategoryIcon(category.name)}
                          </div>
                          <span className="font-medium">{category.name}</span>
                        </div>
                        <span className="text-primary-200 font-bold">
                          {formatScore(category.score)}
                        </span>
                      </div>
                      <p className="text-muted-foreground text-sm leading-relaxed">{category.comment}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Strengths and Areas for Improvement */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              {/* Strengths - only show if there are strengths to display */}
              {feedback?.strengths && feedback.strengths.length > 0 && (
                <div className="bg-card rounded-xl border border-border p-6">
                  <h3 className="text-xl font-semibold mb-4 flex items-center gap-2 text-green-400">
                    <CheckCircle2 className="w-5 h-5" />
                    Strengths
                  </h3>
                  <div className="space-y-3">
                    {feedback.strengths.map((strength: string, index: number) => (
                      <div key={index} className="flex items-start gap-3 bg-muted rounded-lg p-4">
                        <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                        <span className="text-foreground">{strength}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Areas for Improvement - only show if there are areas to display */}
              {feedback?.areasForImprovement && feedback.areasForImprovement.length > 0 && (
                <div className="bg-card rounded-xl border border-border p-6">
                  <h3 className="text-xl font-semibold mb-4 flex items-center gap-2 text-orange-400">
                    <Lightbulb className="w-5 h-5" />
                    Areas for Improvement
                  </h3>
                  <div className="space-y-3">
                    {feedback.areasForImprovement.map((area: string, index: number) => (
                      <div key={index} className="flex items-start gap-3 bg-muted rounded-lg p-4">
                        <AlertCircle className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
                        <span className="text-foreground">{area}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Navigation Buttons */}
          <div className="flex justify-center gap-4 mt-6">
            {!isTPO && (
              <>
                <Button className="bg-secondary hover:bg-secondary/80 text-secondary-foreground px-6 py-3 rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl">
                  <Link href="/" className="flex items-center justify-center w-full">
                    Back to Dashboard
                  </Link>
                </Button>
                <Button className="bg-primary-200 hover:bg-primary-200/90 text-black px-6 py-3 rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl font-medium">
                  <Link href={`/interview/${interviewId}`} className="flex items-center justify-center w-full">
                    Retake Interview
                  </Link>
                </Button>
              </>
            )}
            
            {isTPO && (
              <Button className="bg-secondary hover:bg-secondary/80 text-secondary-foreground px-6 py-3 rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl">
                <Link href="/reports" className="flex items-center justify-center w-full">
                  Back to Reports
                </Link>
              </Button>
            )}
          </div>

          {/* Conversation Modal */}
          <ConversationModal 
            isOpen={showConversation}
            onClose={() => setShowConversation(false)}
            conversation={conversation}
          />
        </div>
      </div>
    </div>
  );
};

export default FeedbackClient; 