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

interface Interview {
  id: string;
  role: string;
  level: string;
  type: string;
  techstack: string[];
  questions: string[];
  createdAt: string;
  targetColleges?: string[];
  targetBranches?: string[];
  targetYears?: number[];
}

const ReportsPage = () => {
  const router = useRouter();
  const { user, loading, authInitialized } = useFirebaseAuth();
  const [isTPO, setIsTPO] = useState(false);
  const [college, setCollege] = useState<College | null>(null);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [filters, setFilters] = useState({
    branch: "",
    year: ""
  });
  
  // Reset branch and year when college changes (handled automatically since we only have one college per TPO)
  const [showTable, setShowTable] = useState(false);

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

  const fetchInterviews = async () => {
    if (!user || !college) {
      console.log("❌ fetchInterviews: Missing user or college", { user: !!user, college: !!college });
      return;
    }

    console.log("🔍 fetchInterviews: Starting request", {
      collegeId: college.id,
      collegeName: college.name,
      filters: filters,
      userId: user.uid
    });

    try {
      const idToken = await user.getIdToken();
      const params = new URLSearchParams({
        ...(filters.branch && { branch: filters.branch }),
        ...(filters.year && { year: filters.year }),
      });

      const url = `/api/reports?${params}`;
      console.log("📡 fetchInterviews: Making API request", { url, params: Object.fromEntries(params) });

      const response = await fetch(url, {
        headers: {
          "Authorization": `Bearer ${idToken}`,
        },
      });

      console.log("📡 fetchInterviews: Response status", { status: response.status, statusText: response.statusText });

      const result = await response.json();
      console.log("📊 fetchInterviews: API response", result);
      
      if (result.success) {
        console.log("✅ fetchInterviews: Success", { 
          interviewCount: result.data?.length || 0,
          interviews: result.data 
        });
        setInterviews(result.data || []);
        setShowTable(true);
      } else {
        console.error("❌ fetchInterviews: API returned error", result.error);
        toast.error("Failed to fetch interviews");
      }
    } catch (error) {
      console.error("❌ fetchInterviews: Exception occurred", error);
      toast.error("Failed to fetch interviews");
    }
  };

  const viewReport = (interviewId: string) => {
    router.push(`/reports/${interviewId}`);
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
          <div className="mb-6">
            <Image
              src="/robot.png"
              alt="Access Denied"
              width={200}
              height={200}
              className="mx-auto opacity-50"
            />
          </div>
          <h2 className="text-3xl font-bold text-gray-800 mb-4">Access Not Allowed</h2>
          <p className="text-gray-600 mb-6">
            You don't have permission to access the reports section. 
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
    <div className="flex flex-col gap-8 max-w-7xl mx-auto p-6">


      {/* Filters */}
      <div className="border-gradient p-0.5 rounded-2xl w-full">
        <div className="card p-6">
          <h3 className="text-xl font-bold mb-4">Filter Interviews</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 form">
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
            
            <div className="flex items-end">
              <Button onClick={fetchInterviews} className="btn-primary w-full">
                Load Reports
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Reports Table */}
      {showTable && (
        <div className="border-gradient p-0.5 rounded-2xl w-full">
          <div className="card p-6">
            <h3 className="text-xl font-bold mb-4">
              Interview Reports ({interviews.length})
            </h3>
            {interviews.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-border rounded-lg overflow-hidden">
                  <thead>
                    <tr className="bg-gray-800 dark:bg-gray-900">
                      <th className="border border-border px-4 py-3 text-left text-white font-semibold">Role</th>
                      <th className="border border-border px-4 py-3 text-left text-white font-semibold">Level</th>
                      <th className="border border-border px-4 py-3 text-left text-white font-semibold">Type</th>
                      <th className="border border-border px-4 py-3 text-left text-white font-semibold">Target Branches</th>
                      <th className="border border-border px-4 py-3 text-left text-white font-semibold">Target Years</th>
                      <th className="border border-border px-4 py-3 text-left text-white font-semibold">Questions</th>
                      <th className="border border-border px-4 py-3 text-left text-white font-semibold">Created</th>
                      <th className="border border-border px-4 py-3 text-left text-white font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {interviews.map((interview) => (
                      <tr key={interview.id} className="bg-white dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors">
                        <td className="border border-border px-4 py-3 text-black dark:text-white">{interview.role}</td>
                        <td className="border border-border px-4 py-3 text-black dark:text-white">{interview.level}</td>
                        <td className="border border-border px-4 py-3 text-black dark:text-white">{interview.type}</td>
                        <td className="border border-border px-4 py-3 text-black dark:text-white">
                          <div className="flex flex-wrap gap-1">
                            {(interview.targetBranches || []).slice(0, 2).map((branch, idx) => (
                              <span key={idx} className="bg-success-100 text-dark-100 text-xs px-2 py-1 rounded">
                                {branch}
                              </span>
                            ))}
                            {(interview.targetBranches || []).length > 2 && (
                              <span className="text-gray-500 dark:text-gray-400 text-xs">
                                +{(interview.targetBranches || []).length - 2} more
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="border border-border px-4 py-3 text-black dark:text-white">
                          <div className="flex flex-wrap gap-1">
                            {(interview.targetYears || []).slice(0, 2).map((year, idx) => (
                              <span key={idx} className="bg-primary-200 text-dark-100 text-xs px-2 py-1 rounded">
                                {year}
                              </span>
                            ))}
                            {(interview.targetYears || []).length > 2 && (
                              <span className="text-gray-500 dark:text-gray-400 text-xs">
                                +{(interview.targetYears || []).length - 2} more
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="border border-border px-4 py-3 text-black dark:text-white">{interview.questions.length}</td>
                        <td className="border border-border px-4 py-3 text-black dark:text-white">
                          {new Date(interview.createdAt).toLocaleDateString()}
                        </td>
                        <td className="border border-border px-4 py-3">
                          <Button
                            onClick={() => viewReport(interview.id)}
                            className="btn-primary text-sm"
                          >
                            Show Report
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <Image
                  src="/robot.png"
                  alt="No Reports"
                  width={120}
                  height={120}
                  className="mx-auto opacity-30 mb-4"
                />
                <p className="text-foreground text-lg font-medium">No interviews found for the selected filters.</p>
                <p className="text-muted-foreground text-sm mt-2">
                  Try adjusting your filters or check back later when interviews are assigned to your students.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {!showTable && (
        <div className="border-gradient p-0.5 rounded-2xl w-full">
          <div className="card p-12 text-center">
            <Image
              src="/robot.png"
              alt="Get Started"
              width={150}
              height={150}
              className="mx-auto opacity-40 mb-6"
            />
            <h3 className="text-xl font-semibold mb-2">Ready to View Reports?</h3>
            <p className="text-light-100 mb-6">
              Set your filters above and click "Load Reports" to see interview analytics for your students.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportsPage; 