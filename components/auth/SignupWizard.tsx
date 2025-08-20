'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronLeft, ChevronRight, User, Mail, Lock, Target } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

interface SignupData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  intendedUse: ('GENERATOR' | 'RECEIVER')[];
}

const steps = [
  { id: 1, title: 'Personal Info', icon: User },
  { id: 2, title: 'Account', icon: Mail },
  { id: 3, title: 'Security', icon: Lock },
  { id: 4, title: 'Preferences', icon: Target },
];

export function SignupWizard() {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<SignupData>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    intendedUse: [],
  });
  const [errors, setErrors] = useState<Partial<SignupData>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { signup } = useAuth();
  const router = useRouter();

  const validateStep = (step: number): boolean => {
    const newErrors: Partial<SignupData> = {};

    switch (step) {
      case 1:
        if (!formData.firstName.trim()) newErrors.firstName = 'First name is required';
        if (!formData.lastName.trim()) newErrors.lastName = 'Last name is required';
        break;
      case 2:
        if (!formData.email.trim()) newErrors.email = 'Email is required';
        else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = 'Email is invalid';
        break;
      case 3:
        if (!formData.password) newErrors.password = 'Password is required';
        else if (formData.password.length < 8) newErrors.password = 'Password must be at least 8 characters';
        break;
      case 4:
        if (formData.intendedUse.length === 0) newErrors.intendedUse = ['Please select at least one option'];
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, steps.length));
    }
  };

  const handlePrev = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    if (!validateStep(4)) return;

    setIsSubmitting(true);
    try {
      await signup(formData);
      router.push('/dashboard');
    } catch (error) {
      setErrors({ email: (error as Error).message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateFormData = (field: keyof SignupData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const toggleIntendedUse = (option: 'GENERATOR' | 'RECEIVER') => {
    setFormData(prev => ({
      ...prev,
      intendedUse: prev.intendedUse.includes(option)
        ? prev.intendedUse.filter(item => item !== option)
        : [...prev.intendedUse, option]
    }));
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  value={formData.firstName}
                  onChange={(e) => updateFormData('firstName', e.target.value)}
                  placeholder="Enter your first name"
                />
                {errors.firstName && <p className="text-sm text-red-500">{errors.firstName}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  value={formData.lastName}
                  onChange={(e) => updateFormData('lastName', e.target.value)}
                  placeholder="Enter your last name"
                />
                {errors.lastName && <p className="text-sm text-red-500">{errors.lastName}</p>}
              </div>
            </div>
          </div>
        );
      
      case 2:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => updateFormData('email', e.target.value)}
                placeholder="Enter your email address"
              />
              {errors.email && <p className="text-sm text-red-500">{errors.email}</p>}
            </div>
          </div>
        );
      
      case 3:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => updateFormData('password', e.target.value)}
                placeholder="Create a secure password"
              />
              {errors.password && <p className="text-sm text-red-500">{errors.password}</p>}
              <p className="text-xs text-muted-foreground">Password must be at least 8 characters long</p>
            </div>
          </div>
        );
      
      case 4:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>What do you intend to do with the app?</Label>
              <p className="text-sm text-muted-foreground mb-4">Select all that apply</p>
              
              <div className="space-y-4">
                <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                  <Checkbox
                    id="generator"
                    checked={formData.intendedUse.includes('GENERATOR')}
                    onCheckedChange={() => toggleIntendedUse('GENERATOR')}
                  />
                  <div className="flex-1">
                    <Label htmlFor="generator" className="font-medium">Generator</Label>
                    <p className="text-sm text-muted-foreground">Create and generate content</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                  <Checkbox
                    id="receiver"
                    checked={formData.intendedUse.includes('RECEIVER')}
                    onCheckedChange={() => toggleIntendedUse('RECEIVER')}
                  />
                  <div className="flex-1">
                    <Label htmlFor="receiver" className="font-medium">Receiver</Label>
                    <p className="text-sm text-muted-foreground">Consume and manage received content</p>
                  </div>
                </div>
              </div>
              
              {errors.intendedUse && <p className="text-sm text-red-500">{errors.intendedUse[0]}</p>}
            </div>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Create Your Account</CardTitle>
          <CardDescription>Complete the steps below to get started</CardDescription>
          
          {/* Progress indicator */}
          <div className="flex justify-center mt-6">
            <div className="flex items-center space-x-4">
              {steps.map((step, index) => {
                const Icon = step.icon;
                const isActive = currentStep === step.id;
                const isCompleted = currentStep > step.id;
                
                return (
                  <div key={step.id} className="flex items-center">
                    <div className={`relative flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all ${
                      isActive ? 'border-primary bg-primary text-primary-foreground' :
                      isCompleted ? 'border-green-500 bg-green-500 text-white' :
                      'border-muted-foreground/30 text-muted-foreground'
                    }`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    {index < steps.length - 1 && (
                      <div className={`w-16 h-0.5 mx-2 transition-colors ${
                        isCompleted ? 'bg-green-500' : 'bg-muted-foreground/30'
                      }`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <div className="text-center">
            <h3 className="text-lg font-semibold">{steps[currentStep - 1].title}</h3>
          </div>
          
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {renderStep()}
            </motion.div>
          </AnimatePresence>
          
          <div className="flex justify-between pt-4">
            <Button
              variant="outline"
              onClick={handlePrev}
              disabled={currentStep === 1}
              className="flex items-center space-x-2"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous</span>
            </Button>
            
            {currentStep < steps.length ? (
              <Button onClick={handleNext} className="flex items-center space-x-2">
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex items-center space-x-2"
              >
                {isSubmitting ? 'Creating Account...' : 'Create Account'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}