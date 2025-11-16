'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { AtSignIcon, LockIcon, UserIcon } from 'lucide-react';
import { z } from "zod";
import { toast } from "sonner";
import { useFirebaseAuth } from "@/hooks/useFirebaseAuth";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";

import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from '@/lib/utils';

import { signIn, signUp, getColleges } from "@/lib/actions/auth.action";

const authFormSchema = (type: 'sign-in' | 'sign-up') => {
  return z.object({
    name: type === "sign-up" ? z.string().min(3) : z.string().optional(),
    email: z.string().email(),
    password: z.string().min(3),
    college: type === "sign-up" ? z.string().min(1, "Please select a college") : z.string().optional(),
    branch: type === "sign-up" ? z.string().min(1, "Please select a branch") : z.string().optional(),
    year: type === "sign-up" ? z.string().min(1, "Please select a year") : z.string().optional(),
  });
};

interface College {
  id: string;
  name: string;
  branches: string[];
  years: number[];
  tpoUserId: string;
}

export function AuthPage({ type = 'sign-in' }: { type?: 'sign-in' | 'sign-up' }) {
  const router = useRouter();
  const { auth } = useFirebaseAuth();
  const [colleges, setColleges] = useState<College[]>([]);
  const [selectedCollegeData, setSelectedCollegeData] = useState<{
    branches: string[];
    years: number[];
  }>({ branches: [], years: [] });
  const [selectedCollege, setSelectedCollege] = useState<string>("");

  const formSchema = authFormSchema(type);
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      college: "",
      branch: "",
      year: "",
    },
  });

  // Fetch colleges on component mount for sign-up
  useEffect(() => {
    if (type === "sign-up") {
      const fetchColleges = async () => {
        const collegeData = await getColleges();
        setColleges(collegeData);
      };
      fetchColleges();
    }
  }, [type]);

  const handleCollegeChange = (collegeId: string) => {
    setSelectedCollege(collegeId);
    form.setValue("college", collegeId);
    
    // Reset branch and year
    form.setValue("branch", "");
    form.setValue("year", "");
    
    if (collegeId) {
      const college = colleges.find(c => c.id === collegeId);
      if (college) {
        setSelectedCollegeData({
          branches: college.branches || [],
          years: college.years || []
        });
      }
    } else {
      setSelectedCollegeData({ branches: [], years: [] });
    }
  };

  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    if (!auth) {
      toast.error("Authentication service not available");
      return;
    }

    try {
      if (type === "sign-up") {
        const { name, email, password, college, branch, year } = data;

        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );

        const result = await signUp({
          uid: userCredential.user.uid,
          name: name!,
          email,
          password,
          college,
          branch,
          year,
        });

        if (!result.success) {
          toast.error(result.message);
          return;
        }

        toast.success("Account created successfully. Please sign in.");
        router.push("/sign-in");
      } else {
        const { email, password } = data;

        const userCredential = await signInWithEmailAndPassword(
          auth,
          email,
          password
        );

        const idToken = await userCredential.user.getIdToken();
        if (!idToken) {
          toast.error("Sign in Failed. Please try again.");
          return;
        }

        await signIn({
          email,
          idToken,
        });

        toast.success("Signed in successfully.");
        window.location.href = "/";
      }
    } catch (error) {
      console.log(error);
      toast.error(`There was an error: ${error}`);
    }
  };

  const isSignIn = type === "sign-in";

  return (
    <main className="relative h-screen overflow-hidden lg:grid lg:grid-cols-2">
      {/* Left Section - Animated Beams */}
      <div className="bg-gradient-to-b from-[#1A1C20] to-[#08090D] relative hidden h-full flex-col border-r border-white/10 p-10 lg:flex">
        <div className="from-background absolute inset-0 z-10 bg-gradient-to-t to-transparent" />
        
        {/* Logo */}
        <div className="z-10 flex items-center gap-2">
          <Image 
            src="/cclogo.png" 
            alt="Campus Credentials Logo" 
            width={180} 
            height={32}
            className="object-contain"
          />
        </div>

        {/* Testimonial */}
        <div className="z-10 mt-auto">
          <blockquote className="space-y-2">
            <p className="text-xl text-light-100">
              &ldquo;This Platform has helped me to save time and prepare for interviews with AI-powered mock sessions.&rdquo;
            </p>
            <footer className="font-mono text-sm font-semibold text-primary-200">
              ~ As told by 10,000+ students
            </footer>
          </blockquote>
        </div>

        {/* Animated Background */}
        <div className="absolute inset-0">
          <FloatingPaths position={1} />
          <FloatingPaths position={-1} />
        </div>
      </div>

      {/* Right Section - Form */}
      <div className="relative flex h-screen flex-col justify-center px-6 lg:px-16 bg-gradient-to-b from-[#1A1C20] to-[#08090D]">
        {/* Background Gradient Orbs */}
        <div
          aria-hidden
          className="absolute inset-0 isolate contain-strict -z-10 opacity-60"
        >
          <div className="bg-[radial-gradient(68.54%_68.72%_at_55.02%_31.46%,rgba(202,197,254,0.06)_0,rgba(202,197,254,0.02)_50%,rgba(202,197,254,0.01)_80%)] absolute top-0 right-0 h-320 w-140 -translate-y-87.5 rounded-full" />
          <div className="bg-[radial-gradient(50%_50%_at_50%_50%,rgba(202,197,254,0.04)_0,rgba(202,197,254,0.01)_80%,transparent_100%)] absolute top-0 right-0 h-320 w-60 [translate:5%_-50%] rounded-full" />
        </div>

        {/* Form Container */}
        <div className="w-full max-w-md mx-auto space-y-6">
          {/* Logo for Mobile */}
          <div className="flex items-center gap-2 lg:hidden justify-center">
            <Image 
              src="/cclogo.png" 
              alt="Campus Credentials Logo" 
              width={180} 
              height={32}
              className="object-contain"
            />
          </div>

          {/* Header */}
          <div className="flex flex-col space-y-2 text-center">
            <h1 className="font-heading text-3xl font-bold tracking-wide text-white">
              {isSignIn ? 'Welcome Back!' : 'Join Us Today!'}
            </h1>
            <p className="text-light-100 text-base">
              {isSignIn 
                ? 'Sign in to practice your AI-powered interviews' 
                : 'Create your account to get started'}
            </p>
          </div>

          {/* Form */}
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-4"
            >
              {/* Name Field (Sign Up Only) */}
              {!isSignIn && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-light-100">Name</label>
                  <div className="relative h-max">
                    <Input
                      {...form.register("name")}
                      placeholder="Your Name"
                      className="peer ps-10 bg-[#27282f]/80 border-white/10 text-white placeholder:text-gray-400 focus:border-[#cac5fe] focus:ring-[#cac5fe]/20 h-12 rounded-xl transition-all duration-200"
                      type="text"
                    />
                    <div className="text-light-100 pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 peer-disabled:opacity-50">
                      <UserIcon className="size-4" aria-hidden="true" />
                    </div>
                  </div>
                  {form.formState.errors.name && (
                    <p className="text-destructive-100 text-sm">
                      {form.formState.errors.name.message}
                    </p>
                  )}
                </div>
              )}

              {/* Email Field */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-light-100">Email</label>
                <div className="relative h-max">
                  <Input
                    {...form.register("email")}
                    placeholder="your.email@example.com"
                    className="peer ps-10 bg-[#27282f]/80 border-white/10 text-white placeholder:text-gray-400 focus:border-[#cac5fe] focus:ring-[#cac5fe]/20 h-12 rounded-xl transition-all duration-200"
                    type="email"
                  />
                  <div className="text-light-100 pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 peer-disabled:opacity-50">
                    <AtSignIcon className="size-4" aria-hidden="true" />
                  </div>
                </div>
                {form.formState.errors.email && (
                  <p className="text-destructive-100 text-sm">
                    {form.formState.errors.email.message}
                  </p>
                )}
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-light-100">Password</label>
                <div className="relative h-max">
                  <Input
                    {...form.register("password")}
                    placeholder="Enter your password"
                    className="peer ps-10 bg-[#27282f]/80 border-white/10 text-white placeholder:text-gray-400 focus:border-[#cac5fe] focus:ring-[#cac5fe]/20 h-12 rounded-xl transition-all duration-200"
                    type="password"
                  />
                  <div className="text-light-100 pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 peer-disabled:opacity-50">
                    <LockIcon className="size-4" aria-hidden="true" />
                  </div>
                </div>
                {form.formState.errors.password && (
                  <p className="text-destructive-100 text-sm">
                    {form.formState.errors.password.message}
                  </p>
                )}
              </div>

              {/* College Fields (Sign Up Only) */}
              {!isSignIn && (
                <>
                  {/* College Dropdown */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-light-100">College</label>
                    <select
                      value={form.watch("college")}
                      onChange={(e) => handleCollegeChange(e.target.value)}
                      className="flex h-12 w-full rounded-xl border border-white/10 bg-[#27282f]/80 px-3 py-2 text-sm text-white ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#cac5fe]/20 focus-visible:border-[#cac5fe] disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200"
                    >
                      <option value="" className="bg-[#27282f] text-gray-400">Select College</option>
                      {colleges.map((college) => (
                        <option key={college.id} value={college.id} className="bg-[#27282f] text-white">
                          {college.name}
                        </option>
                      ))}
                    </select>
                    {form.formState.errors.college && (
                      <p className="text-destructive-100 text-sm">
                        {form.formState.errors.college.message}
                      </p>
                    )}
                  </div>

                  {/* Branch Dropdown */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-light-100">Branch</label>
                    <select
                      {...form.register("branch")}
                      className="flex h-12 w-full rounded-xl border border-white/10 bg-[#27282f]/80 px-3 py-2 text-sm text-white ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#cac5fe]/20 focus-visible:border-[#cac5fe] disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200"
                      disabled={!selectedCollege}
                    >
                      <option value="" className="bg-[#27282f] text-gray-400">Select Branch</option>
                      {selectedCollegeData.branches.map((branch) => (
                        <option key={branch} value={branch} className="bg-[#27282f] text-white">
                          {branch}
                        </option>
                      ))}
                    </select>
                    {form.formState.errors.branch && (
                      <p className="text-destructive-100 text-sm">
                        {form.formState.errors.branch.message}
                      </p>
                    )}
                  </div>

                  {/* Year Dropdown */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-light-100">Year</label>
                    <select
                      {...form.register("year")}
                      className="flex h-12 w-full rounded-xl border border-white/10 bg-[#27282f]/80 px-3 py-2 text-sm text-white ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#cac5fe]/20 focus-visible:border-[#cac5fe] disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200"
                      disabled={!selectedCollege}
                    >
                      <option value="" className="bg-[#27282f] text-gray-400">Select Year</option>
                      {selectedCollegeData.years.map((year) => (
                        <option key={year} value={year} className="bg-[#27282f] text-white">
                          {year}
                        </option>
                      ))}
                    </select>
                    {form.formState.errors.year && (
                      <p className="text-destructive-100 text-sm">
                        {form.formState.errors.year.message}
                      </p>
                    )}
                  </div>
                </>
              )}

              {/* Submit Button */}
              <button 
                type="submit" 
                className="w-full bg-gradient-to-r from-[#b8b3f5] to-[#d4d0fc] hover:from-[#cac5fe] hover:to-[#e0dcff] text-dark-100 font-bold rounded-xl h-12 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
              >
                {isSignIn ? "Sign In" : "Create Account"}
              </button>
            </form>
          </Form>

          {/* Toggle Sign In / Sign Up */}
          <p className="text-center text-light-100 text-sm">
            {isSignIn ? "Don't have an account?" : "Already have an account?"}
            {' '}
            <a
              href={!isSignIn ? "/sign-in" : "/sign-up"}
              className="font-bold text-[#cac5fe] hover:text-[#e0dcff] transition-colors duration-200 underline underline-offset-4"
            >
              {!isSignIn ? "Sign In" : "Sign Up"}
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}

function FloatingPaths({ position }: { position: number }) {
  const paths = Array.from({ length: 36 }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${
      380 - i * 5 * position
    } -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${
      152 - i * 5 * position
    } ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${
      684 - i * 5 * position
    } ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
    width: 0.5 + i * 0.03,
  }));

  return (
    <div className="pointer-events-none absolute inset-0">
      <svg
        className="h-full w-full"
        viewBox="0 0 696 316"
        fill="none"
      >
        <title>Background Paths</title>
        {paths.map((path) => (
          <motion.path
            key={path.id}
            d={path.d}
            stroke="#cbc8fa"
            strokeWidth={path.width}
            strokeOpacity={0.08 + path.id * 0.015}
            initial={{ pathLength: 0.3, opacity: 0.6 }}
            animate={{
              pathLength: 1,
              opacity: [0.25, 0.5, 0.25],
              pathOffset: [0, 1, 0],
            }}
            transition={{
              duration: 20 + Math.random() * 10,
              repeat: Number.POSITIVE_INFINITY,
              ease: 'linear',
            }}
          />
        ))}
      </svg>
    </div>
  );
}

