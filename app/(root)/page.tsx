import Link from "next/link";
import Image from "next/image";

import InterviewCard from "@/components/InterviewCard";

import { getCurrentUser } from "@/lib/actions/auth.action";
import {
  getInterviewsByUserId,
  getInterviewsForStudent,
} from "@/lib/actions/general.action";

async function Home() {
  const user = await getCurrentUser();

  // Handle case where user is not authenticated
  if (!user?.id) {
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

          <Image
            src="/robot.png"
            alt="robo-dude"
            width={400}
            height={400}
            className="max-sm:hidden"
          />
        </section>
      </>
    );
  }

  const [userInterviews, allInterviews] = await Promise.all([
    getInterviewsByUserId(user.id),
    getInterviewsForStudent(user.id),
  ]);

  // Combine both completed and available interviews
  // Remove duplicates by filtering out interviews that appear in both arrays
  const completedInterviewIds = new Set(userInterviews?.map(interview => interview.id) || []);
  const availableInterviews = allInterviews?.filter(interview => !completedInterviewIds.has(interview.id)) || [];
  
  // Combine all interviews
  const allUserInterviews = [...(userInterviews || []), ...availableInterviews];
  const hasInterviews = allUserInterviews.length > 0;

  return (
    <>
      <section className="card-cta">
        <div className="flex flex-col gap-6 max-w-lg">
          <h2>Get Interview-Ready with AI-Powered Practice & Feedback</h2>
          <p className="text-lg">
            Practice real interview questions & get instant feedback
          </p>
        </div>

        <Image
          src="/robot.png"
          alt="robo-dude"
          width={400}
          height={400}
          className="max-sm:hidden"
        />
      </section>

      <section className="flex flex-col gap-6 mt-8">
        <h2>Your Interviews</h2>

        <div className="interviews-section">
          {hasInterviews ? (
            allUserInterviews.map((interview) => (
              <InterviewCard
                key={interview.id}
                userId={user?.id}
                interviewId={interview.id}
                role={interview.role}
                type={interview.type}
                techstack={interview.techstack}
                createdAt={interview.createdAt}
              />
            ))
          ) : (
            <p>No interviews are available for your college/branch/year</p>
          )}
        </div>
      </section>
    </>
  );
}

export default Home;
