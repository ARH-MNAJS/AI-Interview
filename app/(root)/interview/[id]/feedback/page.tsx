import dayjs from "dayjs";
import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";

import {
  getFeedbackByInterviewId,
  getFeedbackById,
  getInterviewById,
} from "@/lib/actions/general.action";
import { Button } from "@/components/ui/button";
import { getCurrentUser, checkTPOAccess } from "@/lib/actions/auth.action";
import FeedbackClient from "./FeedbackClient";

// Helper function to format scores
const formatScore = (score: number | string): string => {
  if (typeof score === 'string') {
    return score; // "Cannot be determined"
  }
  return `${score}/100`;
};

const Feedback = async ({ params, searchParams }: RouteParams) => {
  const { id } = await params;
  const { feedbackId } = await searchParams;
  const user = await getCurrentUser();

  const interview = await getInterviewById(id);
  if (!interview) redirect("/");

  // Check if user is TPO (accessing via reports)
  const isTPO = await checkTPOAccess(user?.id!);
  
  // If feedbackId is provided (TPO viewing student feedback), use it
  // Otherwise, get feedback for current user
  let feedback;
  if (feedbackId && isTPO) {
    feedback = await getFeedbackById(feedbackId);
  } else {
    feedback = await getFeedbackByInterviewId({
      interviewId: id,
      userId: user?.id!,
    });
  }

  return (
    <FeedbackClient 
      feedback={feedback} 
      interview={interview} 
      isTPO={isTPO} 
      interviewId={id} 
    />
  );
};

export default Feedback;
