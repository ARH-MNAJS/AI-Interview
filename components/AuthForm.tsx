"use client";

import { z } from "zod";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import { useFirebaseAuth } from "@/hooks/useFirebaseAuth";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useEffect } from "react";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";

import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";

import { signIn, signUp, getColleges, getCollegeBranches, getCollegeYears } from "@/lib/actions/auth.action";
import FormField from "./FormField";

const authFormSchema = (type: FormType) => {
  return z.object({
    name: type === "sign-up" ? z.string().min(3) : z.string().optional(),
    email: z.string().email(),
    password: z.string().min(3),
    college: type === "sign-up" ? z.string().min(1, "Please select a college") : z.string().optional(),
    branch: type === "sign-up" ? z.string().min(1, "Please select a branch") : z.string().optional(),
    year: type === "sign-up" ? z.string().min(1, "Please select a year") : z.string().optional(),
  });
};

const AuthForm = ({ type }: { type: FormType }) => {
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
        // Use window.location to ensure clean navigation
        window.location.href = "/";
      }
    } catch (error) {
      console.log(error);
      toast.error(`There was an error: ${error}`);
    }
  };

  const isSignIn = type === "sign-in";

  return (
    <div className="card-border lg:min-w-[566px]">
      <div className="flex flex-col gap-2 card py-10 px-10">
        <div className="flex flex-row gap-2 justify-center">
          <Image 
            src="https://campuscredentials.com/CAMPUS.png" 
            alt="Campus Credentials Logo" 
            width={180} 
            height={32}
            className="object-contain"
          />
        </div>

        <h3 className="text-center">Practice job interviews with AI</h3>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="w-full space-y-6 mt-4 form"
          >
            {!isSignIn && (
              <FormField
                control={form.control}
                name="name"
                label="Name"
                placeholder="Your Name"
                type="text"
              />
            )}

            <FormField
              control={form.control}
              name="email"
              label="Email"
              placeholder="Your email address"
              type="email"
            />

            <FormField
              control={form.control}
              name="password"
              label="Password"
              placeholder="Enter your password"
              type="password"
            />

            {!isSignIn && (
              <>
                <div>
                  <label className="label">College</label>
                  <select
                    value={form.watch("college")}
                    onChange={(e) => handleCollegeChange(e.target.value)}
                    className="input w-full"
                  >
                    <option value="">Select College</option>
                    {colleges.map((college) => (
                      <option key={college.id} value={college.id}>
                        {college.name}
                      </option>
                    ))}
                  </select>
                  {form.formState.errors.college && (
                    <p className="text-red-500 text-sm mt-1">
                      {form.formState.errors.college.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="label">Branch</label>
                  <select
                    {...form.register("branch")}
                    className="input w-full"
                    disabled={!selectedCollege}
                  >
                    <option value="">Select Branch</option>
                    {selectedCollegeData.branches.map((branch) => (
                      <option key={branch} value={branch}>
                        {branch}
                      </option>
                    ))}
                  </select>
                  {form.formState.errors.branch && (
                    <p className="text-red-500 text-sm mt-1">
                      {form.formState.errors.branch.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="label">Year</label>
                  <select
                    {...form.register("year")}
                    className="input w-full"
                    disabled={!selectedCollege}
                  >
                    <option value="">Select Year</option>
                    {selectedCollegeData.years.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                  {form.formState.errors.year && (
                    <p className="text-red-500 text-sm mt-1">
                      {form.formState.errors.year.message}
                    </p>
                  )}
                </div>
              </>
            )}

            <Button className="btn" type="submit">
              {isSignIn ? "Sign In" : "Create an Account"}
            </Button>
          </form>
        </Form>

        <p className="text-center">
          {isSignIn ? "No account yet?" : "Have an account already?"}
          <Link
            href={!isSignIn ? "/sign-in" : "/sign-up"}
            className="font-bold text-user-primary ml-1"
          >
            {!isSignIn ? "Sign In" : "Sign Up"}
          </Link>
        </p>
      </div>
    </div>
  );
};

export default AuthForm;
