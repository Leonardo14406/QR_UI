'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { QRCodeSVG } from 'qrcode.react';
import { toPng } from 'html-to-image';
import { format } from 'date-fns';
import { qrApi } from '@/lib/api/qrClient';
import { ContentBlock, TextContentBlock, ImageContentBlock, PageStyle, GenerateQRResponse } from '@/lib/api/qr.types';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Download, Loader2, QrCode as QrCodeIcon, Image as ImageIcon, Type, Palette, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

// Content block types are now imported from qr.types.ts
type ContentBlockType = 'heading' | 'paragraph' | 'image';

// PageStyle is now imported from qr.types.ts

// Base fields shared by all QR variants
const baseQRSchema = z.object({
  oneTime: z.boolean().default(true),
  expiresAt: z.date().optional(),
});

// Generic QR variant: no site content required
const genericQRSchema = baseQRSchema.extend({
  type: z.literal('generic'),
  simplePayload: z.string().optional(),
});

// Site QR variant: site content required
const siteQRSchema = baseQRSchema.extend({
  type: z.literal('site'),
  siteContent: z.object({
    title: z.string().min(1, 'Title is required'),
    description: z.string().optional(),
    blocks: z.array(z.any()).default([]),
    style: z
      .object({
        backgroundColor: z.string().default('#ffffff'),
        textColor: z.string().default('#000000'),
        fontFamily: z.string().default('sans-serif'),
        maxWidth: z.string().default('800px'),
        padding: z.string().default('1rem'),
      })
      .optional()
      .default({
        backgroundColor: '#ffffff',
        textColor: '#000000',
        fontFamily: 'sans-serif',
        maxWidth: '800px',
        padding: '1rem',
      }),
  }),
});

// Discriminated union over 'type'
const qrFormSchema = z.discriminatedUnion('type', [genericQRSchema, siteQRSchema]);

type QRFormValues = z.infer<typeof qrFormSchema> & {
  // Add type for the active tab in the form
  activeTab: 'simple' | 'advanced';
};

interface QRCodeResponse {
  code: string;
  id: string;
  createdAt: string;
  expiresAt?: string;
  oneTime: boolean;
  type: string;
}

export default function CreatePage() {
  const [isLoading, setIsLoading] = useState(false);
  const [qrData, setQrData] = useState<GenerateQRResponse | null>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const { toast } = useToast();

  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [activeBlock, setActiveBlock] = useState<string | null>(null);

  const form = useForm<QRFormValues>({
    resolver: zodResolver(qrFormSchema),
    defaultValues: {
      type: 'site',
      oneTime: true,
      activeTab: 'simple',
      siteContent: {
        title: '',
        description: '',
        blocks: [],
        style: {
          backgroundColor: '#ffffff',
          textColor: '#000000',
          fontFamily: 'sans-serif',
          maxWidth: '800px',
          padding: '1rem',
        },
      },
    },
  });

  const { register, handleSubmit, watch, setValue, formState: { errors } } = form;
  
  // Watch for form values
  const watchType = watch('type');
  const watchActiveTab = watch('activeTab');
  const watchSiteContent = watch('siteContent');

  // Add a new content block
  const addBlock = (type: ContentBlockType) => {
    const baseBlock = {
      id: Math.random().toString(36).substring(2, 9),
      type,
    };
  
    if (type === 'heading' || type === 'paragraph') {
      const textBlock: TextContentBlock = {
        ...baseBlock,
        type,  // This is now properly narrowed to 'heading' | 'paragraph'
        text: type === 'heading' ? 'New Heading' : 'Type your text here...'
      };
      const currentBlocks = watch('siteContent.blocks') || [];
      setValue('siteContent.blocks', [...currentBlocks, textBlock]);
    } else if (type === 'image') {
      const imageBlock: ImageContentBlock = {
        ...baseBlock,
        type: 'image',
        url: '',
        alt: ''
      };
      const currentBlocks = watch('siteContent.blocks') || [];
      setValue('siteContent.blocks', [...currentBlocks, imageBlock]);
    }
  };

  // Update a content block
  const updateBlock = (id: string, updates: Partial<ContentBlock>) => {
    const updatedBlocks = (watchSiteContent?.blocks || []).map(block => 
      block.id === id ? { ...block, ...updates } : block
    );
    setValue('siteContent.blocks' as any, updatedBlocks);
  };

  // Remove a content block
  const removeBlock = (id: string) => {
    const updatedBlocks = (watchSiteContent?.blocks || []).filter(block => block.id !== id);
    setValue('siteContent.blocks' as any, updatedBlocks);
    if (activeBlock === id) {
      setActiveBlock(null);
    }
  };
  const oneTimeChecked = watch('oneTime');
  const typeValue = watch('type');

  const onSubmit = async (data: QRFormValues) => {
    console.log('[CreatePage] Submit clicked with data:', { type: data.type, oneTime: data.oneTime, expiresAt: data.expiresAt, simplePayload: (data as any).simplePayload, siteContent: (data as any).siteContent });
    try {
      setIsLoading(true);
      if (data.type === 'generic') {
        console.log('[CreatePage] Generating generic QR...', {
          payload: (data as any).simplePayload,
          oneTime: data.oneTime,
          expiresAt: data.expiresAt ? format(data.expiresAt, 'yyyy-MM-dd') : undefined,
        });
        const result = await qrApi.generateSimple({
          payload: (data as any).simplePayload || '',
          oneTime: data.oneTime,
          expiresAt: data.expiresAt ? format(data.expiresAt, 'yyyy-MM-dd') : undefined,
        });
        console.log('[CreatePage] Generic QR generated:', result);
        setQrData(result);
        toast({ title: 'Success!', description: 'QR code generated successfully.' });
      } else {
        console.log('[CreatePage] Generating site QR...', (data as any).siteContent);
        const result = await qrApi.generatePage({
          title: (data as any).siteContent?.title,
          description: (data as any).siteContent?.description,
          blocks: (data as any).siteContent?.blocks || [],
          style: (data as any).siteContent?.style,
        });
        console.log('[CreatePage] Site QR generated:', result);
        setQrData(result);
        toast({ title: 'Success!', description: 'QR code with page content generated successfully.' });
      }
    } catch (error) {
      console.error('[CreatePage] Error generating QR code:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to generate QR code',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadQR = async () => {
    if (!qrData) return;

    try {
      const qrElement = document.getElementById('qr-code');
      if (!qrElement) return;

      const dataUrl = await toPng(qrElement);
      const link = document.createElement('a');
      link.download = `qr-${qrData.qr.code}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('Error downloading QR code:', error);
      toast({
        title: 'Error',
        description: 'Failed to download QR code. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Render a content block based on its type
  const renderBlockContent = (block: ContentBlock) => {
    switch (block.type) {
      case 'heading':
        return (
          <div className="space-y-2">
            <Label>Heading Text</Label>
            <Input
              value={block.text}
              onChange={(e) => updateBlock(block.id, { ...block, text: e.target.value })}
              className="text-2xl font-bold"
            />
            <div className="flex items-center space-x-4 mt-2">
              <div className="flex items-center space-x-2">
                <Label htmlFor={`${block.id}-color`}>Color:</Label>
                <input
                  type="color"
                  id={`${block.id}-color`}
                  value={block.style?.color || '#000000'}
                  onChange={(e) => updateBlock(block.id, {
                    ...block,
                    style: { ...block.style, color: e.target.value }
                  })}
                  className="h-8 w-8 p-0 border-0"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Label htmlFor={`${block.id}-align`}>Align:</Label>
                <select
                  id={`${block.id}-align`}
                  value={block.style?.textAlign || 'left'}
                  onChange={(e) => updateBlock(block.id, {
                    ...block,
                    style: { ...block.style, textAlign: e.target.value as any }
                  })}
                  className="rounded-md border border-input px-2 py-1 text-sm"
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                  <option value="justify">Justify</option>
                </select>
              </div>
            </div>
          </div>
        );
      
      case 'paragraph':
        return (
          <div className="space-y-2">
            <Label>Paragraph Text</Label>
            <textarea
              value={block.text}
              onChange={(e) => updateBlock(block.id, { ...block, text: e.target.value })}
              className="w-full min-h-[100px] p-2 border rounded"
            />
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Label htmlFor={`${block.id}-color`}>Color:</Label>
                <input
                  type="color"
                  id={`${block.id}-color`}
                  value={block.style?.color || '#000000'}
                  onChange={(e) => updateBlock(block.id, {
                    ...block,
                    style: { ...block.style, color: e.target.value }
                  })}
                  className="h-8 w-8 p-0 border-0"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Label htmlFor={`${block.id}-size`}>Size:</Label>
                <select
                  id={`${block.id}-size`}
                  value={block.style?.fontSize || '1rem'}
                  onChange={(e) => updateBlock(block.id, {
                    ...block,
                    style: { ...block.style, fontSize: e.target.value }
                  })}
                  className="rounded-md border border-input px-2 py-1 text-sm"
                >
                  <option value="0.875rem">Small</option>
                  <option value="1rem">Normal</option>
                  <option value="1.125rem">Large</option>
                </select>
              </div>
            </div>
          </div>
        );
      
      case 'image':
        return (
          <div className="space-y-2">
            <Label>Image URL</Label>
            <div className="flex space-x-2">
              <Input
                value={block.url}
                onChange={(e) => updateBlock(block.id, { ...block, url: e.target.value })}
                placeholder="https://example.com/image.jpg"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  // This would open a file upload dialog in a real app
                  const url = prompt('Enter image URL:');
                  if (url) updateBlock(block.id, { ...block, url });
                }}
              >
                Upload
              </Button>
            </div>
            {block.url && (
              <div className="mt-2">
                <Label>Preview</Label>
                <div className="mt-1 border rounded p-2">
                  <img 
                    src={block.url} 
                    alt={block.alt || 'Image preview'} 
                    className="max-w-full h-auto max-h-40 mx-auto"
                  />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 mt-2">
              <div className="space-y-2">
                <Label htmlFor={`${block.id}-width`}>Width</Label>
                <Input
                  id={`${block.id}-width`}
                  type="text"
                  value={block.style?.width || '100%'}
                  onChange={(e) => updateBlock(block.id, {
                    ...block,
                    style: { ...block.style, width: e.target.value }
                  })}
                  placeholder="e.g., 100% or 300px"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${block.id}-fit`}>Fit</Label>
                <select
                  id={`${block.id}-fit`}
                  value={block.style?.objectFit || 'contain'}
                  onChange={(e) => updateBlock(block.id, {
                    ...block,
                    style: { ...block.style, objectFit: e.target.value as any }
                  })}
                  className="w-full rounded-md border border-input px-2 py-1 text-sm"
                >
                  <option value="contain">Contain</option>
                  <option value="cover">Cover</option>
                  <option value="fill">Fill</option>
                </select>
              </div>
            </div>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground flex items-center space-x-3">
            <QrCodeIcon className="w-8 h-8 text-primary" />
            <span>Generate QR Code</span>
          </h1>
          <p className="text-muted-foreground mt-2">
            Create a new QR code with custom content and styling
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>QR Code Settings</CardTitle>
            <CardDescription>
              Configure your QR code content and parameters
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* QR Code Type Toggle */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="type">QR Code Type</Label>
                  <div className="flex space-x-4">
                    <Button
                      type="button"
                      variant={watchType === 'generic' ? 'default' : 'outline'}
                      onClick={() => setValue('type', 'generic')}
                    >
                      Generic
                    </Button>
                    <Button
                      type="button"
                      variant={watchType === 'site' ? 'default' : 'outline'}
                      onClick={() => setValue('type', 'site')}
                    >
                      Site (Rich Content)
                    </Button>
                  </div>
                </div>

                {watchType === 'generic' ? (
                  <div className="space-y-2">
                    <Label htmlFor="simplePayload">Content</Label>
                    <Input
                      id="simplePayload"
                      placeholder="Enter text or URL"
                      {...register('simplePayload')}
                    />
                    <p className="text-sm text-muted-foreground">
                      For simple text or URL QR codes
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Site Content Settings */}
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="siteTitle">Page Title</Label>
                        <Input
                          id="siteTitle"
                          placeholder="My QR Code Page"
                          {...register('siteContent.title')}
                        />
                        {form.getFieldState('siteContent.title' as any).error && (
                          <p className="text-sm text-destructive">
                            {String(form.getFieldState('siteContent.title' as any).error?.message || '')}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="siteDescription">Description (optional)</Label>
                        <Input
                          id="siteDescription"
                          placeholder="A brief description of this QR code"
                          {...register('siteContent.description')}
                        />
                      </div>

                      {/* Content Blocks */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <Label>Content Blocks</Label>
                          <div className="flex space-x-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => addBlock('heading')}
                            >
                              <Type className="h-4 w-4 mr-1" />
                              Heading
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => addBlock('paragraph')}
                            >
                              <Type className="h-4 w-4 mr-1" />
                              Text
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => addBlock('image')}
                            >
                              <ImageIcon className="h-4 w-4 mr-1" />
                              Image
                            </Button>
                          </div>
                        </div>

                        {watchSiteContent?.blocks?.length === 0 ? (
                          <div className="border-2 border-dashed rounded-lg p-8 text-center">
                            <p className="text-muted-foreground">
                              No content blocks added yet. Click the buttons above to add some!
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {watchSiteContent?.blocks?.map((block) => (
                              <div 
                                key={block.id} 
                                className={`border rounded-lg p-4 relative ${
                                  activeBlock === block.id ? 'ring-2 ring-primary' : ''
                                }`}
                                onClick={() => setActiveBlock(block.id)}
                              >
                                <div className="flex justify-between items-start mb-2">
                                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                    {block.type}
                                  </span>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeBlock(block.id);
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                                {renderBlockContent(block as ContentBlock)}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Page Styling */}
                      <div className="space-y-4 pt-4 border-t">
                        <div className="flex items-center justify-between">
                          <Label>Page Styling</Label>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="bgColor">Background Color</Label>
                            <div className="flex items-center space-x-2">
                              <input
                                type="color"
                                id="bgColor"
                                value={watch('siteContent.style.backgroundColor') || '#ffffff'}
                                onChange={(e) => 
                                  setValue('siteContent.style.backgroundColor' as any, e.target.value)
                                }
                                className="h-10 w-10 p-0 border-0"
                              />
                              <Input
                                value={watch('siteContent.style.backgroundColor') || '#ffffff'}
                                onChange={(e) => 
                                  setValue('siteContent.style.backgroundColor' as any, e.target.value)
                                }
                                className="flex-1"
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="textColor">Text Color</Label>
                            <div className="flex items-center space-x-2">
                              <input
                                type="color"
                                id="textColor"
                                value={watch('siteContent.style.textColor') || '#000000'}
                                onChange={(e) => 
                                  setValue('siteContent.style.textColor' as any, e.target.value)
                                }
                                className="h-10 w-10 p-0 border-0"
                              />
                              <Input
                                value={watch('siteContent.style.textColor') || '#000000'}
                                onChange={(e) => 
                                  setValue('siteContent.style.textColor' as any, e.target.value)
                                }
                                className="flex-1"
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="fontFamily">Font Family</Label>
                            <select
                              id="fontFamily"
                              value={watch('siteContent.style.fontFamily') || 'sans-serif'}
                              onChange={(e) => 
                                setValue('siteContent.style.fontFamily' as any, e.target.value)
                              }
                              className="w-full rounded-md border border-input px-3 py-2 text-sm"
                            >
                              <option value="sans-serif">Sans-serif</option>
                              <option value="serif">Serif</option>
                              <option value="monospace">Monospace</option>
                            </select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="maxWidth">Max Width</Label>
                            <Input
                              id="maxWidth"
                              value={watch('siteContent.style.maxWidth') || '800px'}
                              onChange={(e) => 
                                setValue('siteContent.style.maxWidth' as any, e.target.value)
                              }
                              placeholder="e.g., 800px or 100%"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* QR Code Options */}
                <div className="space-y-4 pt-4 border-t">
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="oneTime"
                        checked={oneTimeChecked}
                        onCheckedChange={(checked) => setValue('oneTime', checked as boolean)}
                      />
                      <Label htmlFor="oneTime">One-time use only</Label>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {oneTimeChecked 
                        ? 'This QR code can only be scanned once.'
                        : 'This QR code can be scanned multiple times.'}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Expiration (optional)</Label>
                    <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full justify-start text-left font-normal',
                            !watch('expiresAt') && 'text-muted-foreground'
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {watch('expiresAt') ? (
                            format(watch('expiresAt')!, 'PPP')
                          ) : (
                            <span>No expiration</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={watch('expiresAt') || undefined}
                          onSelect={(date) => {
                            setValue('expiresAt', date || undefined);
                            setIsCalendarOpen(false);
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <p className="text-sm text-muted-foreground">
                      {watch('expiresAt')
                        ? `Expires on ${format(watch('expiresAt')!, 'PPP')}`
                        : 'This QR code will not expire.'}
                    </p>
                    {errors.expiresAt && (
                      <p className="text-sm text-destructive">{errors.expiresAt.message}</p>
                    )}
                  </div>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading} onClick={handleSubmit(onSubmit)}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  'Generate QR Code'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {qrData && (
          <Card className="mt-6 print:shadow-none print:border-0">
            <CardHeader>
              <CardTitle>Your QR Code</CardTitle>
              <CardDescription>
                Scan this code or download/print it
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center space-y-6">
                <div 
                  id="qr-code" 
                  className="p-4 bg-white rounded-lg border border-border flex items-center justify-center"
                >
                  {qrData?.qr ? (
                    <QRCodeSVG 
                      value={qrData.qr.type === 'page' ? qrData.qr.url || '' : qrData.qr.code} 
                      size={128} 
                      level="H"
                      includeMargin={true}
                    />
                  ) : (
                    <div className="text-center p-4 text-muted-foreground">
                      <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />
                      <p>Generating QR code...</p>
                    </div>
                  )}
                </div>
                
                <div className="flex justify-center w-full">
                  <Button 
                    variant="outline" 
                    className="w-48"
                    onClick={handleDownloadQR}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                </div>

                {qrData?.qr ? (
                  <div className="w-full max-w-md space-y-2 text-sm text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Type:</span>
                      <span className="font-medium text-foreground">
                        {qrData.qr.type?.charAt(0).toUpperCase() + qrData.qr.type?.slice(1) || 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>One-time use:</span>
                      <span className="font-medium text-foreground">
                        {qrData.qr.oneTime ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Creator:</span>
                      <span className="font-medium text-foreground">
                        {`${qrData.qr.creator?.firstName ?? ''} ${qrData.qr.creator?.lastName ?? ''}`.trim() || 'Unknown'}
                      </span>
                    </div>
                    {qrData.qr.expiresAt && (
                      <div className="flex justify-between">
                        <span>Expires:</span>
                        <span className="font-medium text-foreground">
                          {format(new Date(qrData.qr.expiresAt), 'PPP')}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Created:</span>
                      <span className="font-medium text-foreground">
                        {format(new Date(qrData.qr.createdAt), 'PPP')}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="w-full max-w-md space-y-2 text-sm text-muted-foreground">
                    <p>No QR code data available. Please generate a QR code first.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}