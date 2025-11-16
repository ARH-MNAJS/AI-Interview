"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect, useMemo } from "react";
import { Search } from "lucide-react";

import InterviewCardClient from "@/components/InterviewCardClient";
import AnimatedCharacters from "@/components/AnimatedCharacters";
import { useFirebaseAuth } from "@/hooks/useFirebaseAuth";
import { useNavbarHover } from "@/contexts/NavbarHoverContext";
import {
  getInterviewsByUserId,
  getInterviewsForStudent,
} from "@/lib/actions/general.action";

function Home() {
  const { user } = useFirebaseAuth();
  const { hoveringButton } = useNavbarHover();
  const [allUserInterviews, setAllUserInterviews] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInterviews = async () => {
      if (!user?.uid) {
        setLoading(false);
        return;
      }

      try {
        const [userInterviews, allInterviews] = await Promise.all([
          getInterviewsByUserId(user.uid),
          getInterviewsForStudent(user.uid),
        ]);

        // Combine both completed and available interviews
        // Remove duplicates by filtering out interviews that appear in both arrays
        const completedInterviewIds = new Set(userInterviews?.map((interview: any) => interview.id) || []);
        const availableInterviews = allInterviews?.filter((interview: any) => !completedInterviewIds.has(interview.id)) || [];
        
        // Combine all interviews
        const combined = [...(userInterviews || []), ...availableInterviews];
        setAllUserInterviews(combined);
      } catch (error) {
        console.error("Error fetching interviews:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchInterviews();
  }, [user?.uid]);

  // Filter interviews based on search query (matching with interview title/role only)
  const filteredInterviews = useMemo(() => {
    if (!searchQuery.trim()) return allUserInterviews;
    
    const query = searchQuery.toLowerCase();
    return allUserInterviews.filter((interview) => {
      const interviewTitle = `${interview.role} Interview`.toLowerCase();
      return (
        interviewTitle.includes(query) ||
        interview.role?.toLowerCase().includes(query)
      );
    });
  }, [allUserInterviews, searchQuery]);

  // Handle case where user is not authenticated
  if (!user?.uid && !loading) {
    return (
      <>
        <section className="card-cta">
          <div className="flex flex-col gap-6 max-w-lg">
            <h2>Get Interview-Ready with AI-Powered Practice & Feedback</h2>
            <p className="text-lg">
              Practice real interview questions & get instant feedback
            </p>
            <Link href="/sign-in" className="cta-btn">
              Sign In to Get Started
            </Link>
          </div>
        </section>
      </>
    );
  }

  const hasInterviews = filteredInterviews.length > 0;

  return (
    <div className="flex items-center justify-center w-full -my-8" style={{ minHeight: 'calc(100vh)' }}>
      <div className="flex lg:flex-row flex-col h-[75vh] gap-6 max-sm:flex-col w-full">
        {/* Left Section - Hero Content (Opaque) */}
        <div className="lg:w-[38%] lg:h-full bg-gradient-to-b from-[#1A1C20] to-[#08090D] border border-white/10 flex items-center justify-center px-8 py-6 max-sm:p-6 max-sm:min-h-[50vh] rounded-2xl shadow-2xl">
          <div className="max-w-md space-y-6 flex flex-col items-center">
            {/* Animated Characters */}
            <div className="flex justify-center">
              <AnimatedCharacters isHoveringButton={hoveringButton} />
            </div>
            
            <div className="space-y-4 text-center">
              <h1 className="text-3xl font-bold text-white leading-tight max-sm:text-2xl">
                Get Interview-Ready with AI-Powered Practice & Feedback
              </h1>
              <p className="text-base text-light-100 leading-relaxed">
                Practice real interview questions & get instant feedback from our advanced AI interviewer
              </p>
            </div>
          </div>
        </div>

        {/* Right Section - Interview Cards (Scrollable) */}
        <div className="lg:flex-1 lg:h-full flex flex-col">
          {/* Sticky Header with Search */}
          <div className="sticky top-0 z-10 bg-[#08090D]/95 backdrop-blur-sm pb-4 flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-white whitespace-nowrap">Your Interviews</h2>
            
            <div className="flex-1 max-w-md relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search interviews..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-10 pr-4 rounded-xl bg-[#27282f]/80 border border-white/10 text-white placeholder:text-gray-400 focus:outline-none focus:border-[#cac5fe] focus:ring-2 focus:ring-[#cac5fe]/20 transition-all duration-200"
              />
            </div>
          </div>

          {/* Scrollable Cards */}
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 pb-4">
              {hasInterviews ? (
                filteredInterviews.map((interview) => (
                  <InterviewCardClient
                    key={interview.id}
                    userId={user?.uid}
                    interviewId={interview.id}
                    role={interview.role}
                    type={interview.type}
                    techstack={interview.techstack}
                    createdAt={interview.createdAt}
                  />
                ))
              ) : (
                <div className="col-span-full text-center py-12">
                  <p className="text-light-100 text-lg">
                    {searchQuery ? "No relevant searches found" : "No interviews are available for your college/branch/year"}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Home;
