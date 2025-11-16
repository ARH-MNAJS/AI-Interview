"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useFirebaseAuth } from "@/hooks/useFirebaseAuth";
import { User } from "firebase/auth";
import { Button } from "@/components/ui/button";
import Image from "next/image";

interface College {
  id: string;
  name: string;
  branches: string[];
  years: number[];
  tpoUserId: string;
}

const ReportsDownloadPage = () => {
  const router = useRouter();
  const { user, loading, authInitialized } = useFirebaseAuth();
  const [isTPO, setIsTPO] = useState(false);
  const [college, setCollege] = useState<College | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [stats, setStats] = useState<{
    total: number;
    filtered: number;
  } | null>(null);

  const [filters, setFilters] = useState({
    branch: "",
    year: "",
    startDate: "",
    endDate: "",
    format: "csv"
  });

  useEffect(() => {
    if (!authInitialized) return;

    if (!user) {
      router.push("/sign-in");
      return;
    }
    
    // Check if user is TPO
    checkTPOAccess(user);
  }, [user, authInitialized, router]);

  const checkTPOAccess = async (user: User) => {
    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/reports", {
        headers: {
          "Authorization": `Bearer ${idToken}`,
        },
      });

      const result = await response.json();
      
      if (result.success) {
        setIsTPO(true);
        // Fetch college details
        await fetchCollegeDetails(result.collegeId);
      } else {
        setIsTPO(false);
      }
    } catch (error) {
      console.error("Error checking TPO access:", error);
      setIsTPO(false);
    }
  };

  const fetchCollegeDetails = async (collegeId: string) => {
    try {
      const response = await fetch("/api/colleges");
      const result = await response.json();
      
      if (result.success) {
        const collegeData = result.data.find((c: College) => c.id === collegeId);
        if (collegeData) {
          setCollege(collegeData);
        }
      }
    } catch (error) {
      console.error("Error fetching college details:", error);
    }
  };

  const getDataStats = async () => {
    if (!user) return;

    try {
      const idToken = await user.getIdToken();
      const params = new URLSearchParams({
        format: "json",
        ...(filters.branch && { branch: filters.branch }),
        ...(filters.year && { year: filters.year }),
        ...(filters.startDate && { startDate: filters.startDate }),
        ...(filters.endDate && { endDate: filters.endDate }),
      });

      const response = await fetch(`/api/reportsdownload?${params}`, {
        headers: {
          "Authorization": `Bearer ${idToken}`,
        },
      });

      const result = await response.json();
      
      if (result.success) {
        setStats({
          total: result.total,
          filtered: result.total
        });
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  const downloadReports = async () => {
    if (!user) {
      toast.error("Please log in to download reports");
      return;
    }

    setDownloading(true);

    try {
      const idToken = await user.getIdToken();
      const params = new URLSearchParams({
        format: filters.format,
        ...(filters.branch && { branch: filters.branch }),
        ...(filters.year && { year: filters.year }),
        ...(filters.startDate && { startDate: filters.startDate }),
        ...(filters.endDate && { endDate: filters.endDate }),
      });

      console.log("🔽 Starting download with params:", Object.fromEntries(params));

      const response = await fetch(`/api/reportsdownload?${params}`, {
        headers: {
          "Authorization": `Bearer ${idToken}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Download failed");
      }

      if (filters.format === "csv") {
        // Handle CSV download
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        
        // Extract filename from Content-Disposition header or create default
        const contentDisposition = response.headers.get("content-disposition");
        let filename = "interview_reports.csv";
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename="(.+)"/);
          if (filenameMatch) {
            filename = filenameMatch[1];
          }
        }
        
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        toast.success("Reports downloaded successfully!");
      } else {
        // Handle JSON download
        const data = await response.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `interview_reports_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        toast.success("Reports downloaded successfully!");
      }

    } catch (error) {
      console.error("❌ Download error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to download reports");
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Loading...</h2>
        </div>
      </div>
    );
  }

  if (!isTPO || !college) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md">
          <h2 className="text-3xl font-bold text-gray-800 mb-4">Access Not Allowed</h2>
          <p className="text-gray-600 mb-6">
            You don't have permission to access the reports download section. 
            This area is restricted to Training and Placement Officers (TPO) only.
          </p>
          <Button 
            onClick={() => router.push("/")}
            className="btn-primary"
          >
            Go Back to Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-4xl font-bold text-foreground mb-4">Download Interview Reports</h1>
        <p className="text-light-100 text-lg">
          Export all feedback data for {college.name} students to analyze interview performance and trends.
        </p>
      </div>

      {/* Download Configuration */}
      <div className="border-gradient p-0.5 rounded-2xl w-full">
        <div className="card p-6">
          <h3 className="text-xl font-bold mb-6">Configure Download</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Filter Options */}
            <div className="space-y-4">
              <h4 className="text-lg font-semibold text-foreground">Filter Options</h4>
              
              <div>
                <label className="label">Filter by Branch</label>
                <select
                  value={filters.branch}
                  onChange={(e) => setFilters(prev => ({ ...prev, branch: e.target.value }))}
                  className="input w-full"
                >
                  <option value="">All Branches</option>
                  {college.branches.map((branch) => (
                    <option key={branch} value={branch}>
                      {branch}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="label">Filter by Year</label>
                <select
                  value={filters.year}
                  onChange={(e) => setFilters(prev => ({ ...prev, year: e.target.value }))}
                  className="input w-full"
                >
                  <option value="">All Years</option>
                  {college.years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Date Range and Format */}
            <div className="space-y-4">
              <h4 className="text-lg font-semibold text-foreground">Date Range & Format</h4>
              
              <div>
                <label className="label">Start Date (Optional)</label>
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
                  className="input w-full"
                />
              </div>
              
              <div>
                <label className="label">End Date (Optional)</label>
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
                  className="input w-full"
                />
              </div>
              
              <div>
                <label className="label">Download Format</label>
                <select
                  value={filters.format}
                  onChange={(e) => setFilters(prev => ({ ...prev, format: e.target.value }))}
                  className="input w-full"
                >
                  <option value="csv">CSV (Recommended for Excel)</option>
                  <option value="json">JSON (For developers)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between pt-4 border-t border-border">
            <Button 
              onClick={getDataStats}
              className="btn-secondary w-full sm:w-auto"
              disabled={downloading}
            >
              Preview Data Count
            </Button>
            
            <Button 
              onClick={downloadReports}
              className="btn-primary w-full sm:w-auto"
              disabled={downloading}
            >
              {downloading ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  Generating Download...
                </>
              ) : (
                <>
                  📥 Download Reports
                </>
              )}
            </Button>
          </div>

          {/* Stats Display */}
          {stats && (
            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                <strong>{stats.filtered}</strong> records will be included in your download based on current filters.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Information */}
      <div className="border-gradient p-0.5 rounded-2xl w-full">
        <div className="card p-6">
          <h3 className="text-xl font-bold mb-4">Download Information</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold text-foreground mb-2">What's Included?</h4>
              <ul className="text-sm text-light-100 space-y-1">
                <li>• Student details (name, email, branch, year)</li>
                <li>• Interview information (role, level, type, tech stack)</li>
                <li>• Complete feedback scores and comments</li>
                <li>• Strengths and improvement areas</li>
                <li>• Final assessments and timestamps</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold text-foreground mb-2">Data Privacy</h4>
              <ul className="text-sm text-light-100 space-y-1">
                <li>• Only your college students' data</li>
                <li>• Secure TPO-authenticated access</li>
                <li>• Export includes all historical data</li>
                <li>• Files are generated on-demand</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Navigation */}
      <div className="text-center">
        <Button 
          onClick={() => router.push("/reports")}
          className="btn-secondary"
        >
          ← Back to Reports Dashboard
        </Button>
      </div>
    </div>
  );
};

export default ReportsDownloadPage; 