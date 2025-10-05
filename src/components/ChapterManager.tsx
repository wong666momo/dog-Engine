'use client';

import type { Book, BookNode, CommunityPrompt, BookNodeType } from '@/lib/types';
import { Button } from './ui/button';
import { Plus, Trash2, Edit, Download, Copy, Bot, Users, Loader2, WandSparkles, Folder, FileText, FolderPlus, FilePlus } from 'lucide-react';
import { cn, generateUUID } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogDescription
} from './ui/dialog';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ScrollArea } from './ui/scroll-area';
import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { 
  generateContent, 
  listGeminiModels, 
  hasApiKey, 
  getDefaultModel,
  type GeminiModel 
} from '@/lib/gemini-client';
import { getPrompts } from '@/lib/actions/community';
import { GeminiSettings } from './GeminiSettings';

// --- Helper functions for tree manipulation ---

const removeNodeFromTree = (nodes: BookNode[], nodeId: string): BookNode[] => {
  return nodes.filter(node => node.id !== nodeId).map(node => {
    if (node.children) {
      node.children = removeNodeFromTree(node.children, nodeId);
    }
    return node;
  });
};

const addNodeToTree = (nodes: BookNode[], parentId: string | null, newNode: BookNode): BookNode[] => {
  if (parentId === null) {
    return [...nodes, newNode];
  }
  return nodes.map(node => {
    if (node.id === parentId) {
      if (node.type === 'folder') {
        const newChildren = [...(node.children || []), newNode];
        return { ...node, children: newChildren };
      }
    }
    if (node.children) {
      return { ...node, children: addNodeToTree(node.children, parentId, newNode) };
    }
    return node;
  });
};

const updateNodeInTree = (nodes: BookNode[], nodeId: string, updates: Partial<BookNode>): BookNode[] => {
    return nodes.map(node => {
        if (node.id === nodeId) {
            return { ...node, ...updates };
        }
        if (node.children) {
            return { ...node, children: updateNodeInTree(node.children, nodeId, updates) };
        }
        return node;
    });
};

const findNodeInTree = (nodes: BookNode[], nodeId: string): BookNode | null => {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    if (node.children) {
      const found = findNodeInTree(node.children, nodeId);
      if (found) return found;
    }
  }
  return null;
};


interface ChapterManagerProps {
  book: Book;
  updateBook: (book: Book) => void;
  activeChapter: BookNode | null;
  setActiveChapter: (chapter: BookNode | null) => void;
}

export default function ChapterManager({ book, updateBook, activeChapter, setActiveChapter }: ChapterManagerProps) {
  const { toast } = useToast();
  const [renameDialogNode, setRenameDialogNode] = useState<BookNode | null>(null);
  const [newNodeTitle, setNewNodeTitle] = useState('');
  
  const [fetchDialogNode, setFetchDialogNode] = useState<BookNode | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [isAiRewriting, setIsAiRewriting] = useState(false);
  
  const DEFAULT_REWRITE_PERSONA = `你是一个专业的网络小说仿写助手。请根据原文内容，保持故事情节和人物设定不变，但用不同的表达方式重新创作，使文字更加生动有趣。`;
  const DEFAULT_REWRITE_PROMPT = `请仿写以下章节内容，要求：
1. 保持原有故事情节和人物关系
2. 改变叙述方式和表达手法
3. 丰富细节描写和对话
4. 保持章节的整体长度`;

  const [rewritePersona, setRewritePersona] = useState<string>(() => localStorage.getItem('chapter-rewrite-persona') || DEFAULT_REWRITE_PERSONA);
  const [rewritePrompt, setRewritePrompt] = useState<string>(() => localStorage.getItem('chapter-rewrite-prompt') || DEFAULT_REWRITE_PROMPT);
  
  const [availableModels, setAvailableModels] = useState<GeminiModel[]>([]);
  const [isModelListLoading, setIsModelListLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState('');
  const [maxTokens, setMaxTokens] = useState<number>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('chapter-rewrite-max-tokens') : null;
    const n = saved ? parseInt(saved, 10) : 4096;
    return Number.isFinite(n) && n > 256 ? n : 4096;
  });
  
  const [communityPrompts, setCommunityPrompts] = useState<CommunityPrompt[]>([]);
  const [isCommunityPromptsLoading, setIsCommunityPromptsLoading] = useState(false);

  useEffect(() => {
    if (!fetchDialogNode) return;
    
    async function loadDialogData() {
      if (availableModels.length === 0) {
        setIsModelListLoading(true);
        try {
          if (hasApiKey()) {
            const models = await listGeminiModels();
            setAvailableModels(models);
            const flashModel = models.find(m => m.id.includes('gemini-2.5-flash') || m.id.includes('2.5-flash'));
            if (flashModel) setSelectedModel(flashModel.id);
            else if (models.length > 0) setSelectedModel(models[0].id);
          } else {
            setAvailableModels([
              { id: 'gemini-2.5-flash', name: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
              { id: 'gemini-2.5-pro', name: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro' },
            ]);
            setSelectedModel(getDefaultModel());
          }
        } catch (error) {
          console.error("Failed to fetch models:", error);
          setSelectedModel(getDefaultModel());
        } finally {
          setIsModelListLoading(false);
        }
      }

      try {
        setIsCommunityPromptsLoading(true);
        const prompts = await getPrompts();
        setCommunityPrompts(prompts);
      } catch (error) {
        console.error('Failed to load community prompts:', error);
      } finally {
        setIsCommunityPromptsLoading(false);
      }
    }
    
    loadDialogData();
  }, [fetchDialogNode, availableModels.length]);

  const handleAddNode = (type: BookNodeType, parentId: string | null) => {
    const title = type === 'folder' ? '新卷' : '新章节';
    const newNode: BookNode = {
      id: generateUUID(),
      title,
      type: type,
      ...(type === 'folder' ? { children: [] } : { content: '' }),
    };

    const updatedChapters = addNodeToTree(book.chapters, parentId, newNode);
    updateBook({ ...book, chapters: updatedChapters });

    if (type === 'file') {
      setActiveChapter(newNode);
    }
    setRenameDialogNode(newNode);
    setNewNodeTitle(title);
  };

  const handleDeleteNode = (nodeId: string) => {
    const updatedChapters = removeNodeFromTree(book.chapters, nodeId);
    updateBook({ ...book, chapters: updatedChapters });
    if (activeChapter?.id === nodeId) {
      setActiveChapter(null);
    }
  };
  
  const handleRenameNode = () => {
    if (!renameDialogNode || !newNodeTitle.trim()) return;

    const updatedChapters = updateNodeInTree(book.chapters, renameDialogNode.id, { title: newNodeTitle.trim() });
    updateBook({ ...book, chapters: updatedChapters });

    if (activeChapter?.id === renameDialogNode.id) {
        const newActiveNode = findNodeInTree(updatedChapters, renameDialogNode.id);
        if(newActiveNode) setActiveChapter(newActiveNode);
    }
    handleCloseRenameDialog();
  };

  const handleCloseRenameDialog = () => {
    setRenameDialogNode(null);
    setNewNodeTitle('');
  }

  const openRenameDialog = (node: BookNode) => {
    setRenameDialogNode(node);
    setNewNodeTitle(node.title);
  }

  const openFetchDialog = (node: BookNode) => {
    if (node.type !== 'file') return;
    setFetchDialogNode(node);
  }

  const closeFetchDialog = () => {
    setFetchDialogNode(null);
    setIsFetching(false);
    setIsAiRewriting(false);
  }

  const handleUpdateNodeContent = (nodeId: string, content: string, title?: string) => {
      const updates: Partial<BookNode> = { content };
      if (title) updates.title = title;
      const updatedChapters = updateNodeInTree(book.chapters, nodeId, updates);
      updateBook({ ...book, chapters: updatedChapters });
      const updatedNode = findNodeInTree(updatedChapters, nodeId);
      if (updatedNode) setActiveChapter(updatedNode);
  };

  const handleDirectCopy = async () => {
    if (!fetchDialogNode || !book.sourceId || !fetchDialogNode.url) return;
    
    setIsFetching(true);
    try {
      const res = await fetch(`/api/bookstore/chapter?url=${encodeURIComponent(fetchDialogNode.url)}&sourceId=${book.sourceId}`);
      if (!res.ok) throw new Error('获取章节内容失败');
      const data = await res.json();
      if (!data?.success) throw new Error(data.error || '获取章节内容失败');
      
      handleUpdateNodeContent(fetchDialogNode.id, data.chapter.content, fetchDialogNode.title || data.chapter.title);
      toast({ title: '成功', description: '原文已复制到编辑器' });
      closeFetchDialog();
    } catch (error: any) {
      toast({ title: '错误', description: error.message, variant: 'destructive' });
    } finally {
      setIsFetching(false);
    }
  }

  const handleAiRewrite = async () => {
    if (!fetchDialogNode || !book.sourceId || !fetchDialogNode.url) return;
    if (!hasApiKey()) {
      toast({ title: '请先配置API密钥', variant: 'destructive' });
      return;
    }

    setIsFetching(true);
    setIsAiRewriting(true);
    
    try {
      const res = await fetch(`/api/bookstore/chapter?url=${encodeURIComponent(fetchDialogNode.url)}&sourceId=${book.sourceId}`);
      if (!res.ok) throw new Error('获取章节内容失败');
      const data = await res.json();
      if (!data?.success) throw new Error(data.error || '获取章节内容失败');
      
      const prompt = `${rewritePrompt}\n\n原文内容：\n${data.chapter.content}`;
      const result = await generateContent(selectedModel, prompt, {
          temperature: 0.7,
          maxOutputTokens: maxTokens,
          systemInstruction: rewritePersona,
      });
      
      handleUpdateNodeContent(fetchDialogNode.id, result, fetchDialogNode.title || data.chapter.title);
      toast({ title: '成功', description: 'AI仿写完成' });
      closeFetchDialog();
    } catch (error: any) {
      toast({ title: 'AI仿写失败', description: error.message, variant: 'destructive' });
    } finally {
      setIsFetching(false);
      setIsAiRewriting(false);
    }
  }

  const persistSetting = (key: string, value: string) => {
    if (typeof window !== 'undefined') localStorage.setItem(key, value);
  };
  const persistRewritePersona = (text: string) => { setRewritePersona(text); persistSetting('chapter-rewrite-persona', text); };
  const persistRewritePrompt = (text: string) => { setRewritePrompt(text); persistSetting('chapter-rewrite-prompt', text); };

  const handleCommunityPromptSelect = (promptId: string) => {
    const selected = communityPrompts.find(p => p.id === promptId);
    if (selected) {
      persistRewritePersona(selected.prompt);
      toast({ title: '已应用社区提示词', description: `已套用：${selected.name}` });
    }
  }

  const NodeItem = useCallback(({ node, level }: { node: BookNode; level: number }) => (
    <li key={node.id}>
      <ContextMenu>
        <ContextMenuTrigger>
          <div
            role="button"
            tabIndex={0}
            onClick={() => { if (node.type === 'file') setActiveChapter(node) }}
            onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && node.type === 'file') setActiveChapter(node); }}
            className={cn(
              'w-full text-left p-2 rounded-md flex items-center justify-between group cursor-pointer',
              activeChapter?.id === node.id ? 'bg-primary/20 text-primary-foreground' : 'hover:bg-accent/50',
            )}
            style={{ paddingLeft: `${level * 1.25 + 0.5}rem` }}
          >
            <div className={cn("flex items-center gap-2 truncate", node.type === 'folder' && 'font-semibold')}>
              {node.type === 'folder' ? <Folder className="h-4 w-4 flex-shrink-0" /> : <FileText className="h-4 w-4 flex-shrink-0" />}
              <span className="truncate pr-2">{node.title}</span>
            </div>
            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
               {node.type === 'file' && node.url && book.sourceId && (
                 <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => {e.stopPropagation(); openFetchDialog(node)}} title="抓取章节内容">
                    <Download className="h-4 w-4" />
                  </Button>
               )}
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent onClick={e => e.stopPropagation()}>
          <ContextMenuItem onClick={() => handleAddNode('file', node.type === 'folder' ? node.id : null)}>
            <FilePlus className="mr-2 h-4 w-4" /> 添加文件
          </ContextMenuItem>
          {node.type === 'folder' &&
            <ContextMenuItem onClick={() => handleAddNode('folder', node.id)}>
              <FolderPlus className="mr-2 h-4 w-4" /> 添加子文件夹
            </ContextMenuItem>
          }
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => openRenameDialog(node)}>
            <Edit className="mr-2 h-4 w-4" /> 重命名
          </ContextMenuItem>
          <AlertDialog>
            <AlertDialogTrigger asChild>
                <ContextMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive/90 focus:text-destructive focus:bg-destructive/10">
                    <Trash2 className="mr-2 h-4 w-4" /> 删除
                </ContextMenuItem>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                <AlertDialogTitle>确定要删除此项吗？</AlertDialogTitle>
                <AlertDialogDescription>
                    此操作无法撤销。{node.type === 'folder' ? '文件夹及其所有内容' : '章节'}将被永久删除。
                </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleDeleteNode(node.id)} className="bg-destructive hover:bg-destructive/90">删除</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </ContextMenuContent>
      </ContextMenu>
      {node.type === 'folder' && node.children && node.children.length > 0 && (
        <ul>
          {node.children.map(child => <NodeItem key={child.id} node={child} level={level + 1} />)}
        </ul>
      )}
    </li>
  ), [activeChapter, book.chapters, book.sourceId]);

  return (
    <div className="flex flex-col h-full">
        <div className="p-2 flex-shrink-0 space-y-2 border-b">
            <Button onClick={() => handleAddNode('file', null)} className="w-full">
                <FilePlus className="mr-2 h-4 w-4" />
                新建章节
            </Button>
            <Button onClick={() => handleAddNode('folder', null)} className="w-full" variant="outline">
                <FolderPlus className="mr-2 h-4 w-4" />
                新建卷
            </Button>
        </div>
        <ScrollArea className="flex-grow">
            {book.chapters.length > 0 ? (
                <ul className="p-2">
                  {book.chapters.map((node) => <NodeItem key={node.id} node={node} level={0} />)}
                </ul>
            ) : (
                <div className="text-center p-4 text-muted-foreground text-sm">
                    暂无内容。
                </div>
            )}
        </ScrollArea>

        {/* Rename Dialog */}
        <Dialog open={!!renameDialogNode} onOpenChange={(open) => !open && handleCloseRenameDialog()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>重命名</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                    <Label htmlFor="node-name">新名称</Label>
                    <Input id="node-name" value={newNodeTitle} onChange={e => setNewNodeTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleRenameNode()} />
                </div>
                <DialogFooter>
                    <Button variant="secondary" onClick={handleCloseRenameDialog}>取消</Button>
                    <Button onClick={handleRenameNode}>保存</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* Fetch Dialog */}
        <Dialog open={!!fetchDialogNode} onOpenChange={(open) => !open && closeFetchDialog()}>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 justify-between">
                        <div className="flex items-center gap-2"><Download className="h-5 w-5" />抓取章节内容</div>
                        <GeminiSettings variant="ghost" showStatus={true} />
                    </DialogTitle>
                    <DialogDescription>选择处理方式：直接复制原文到编辑器，或使用AI仿写后添加到编辑器。</DialogDescription>
                </DialogHeader>
                <ScrollArea className="max-h-[60vh] pr-4">
                    <div className="space-y-6 py-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Button onClick={handleDirectCopy} disabled={isFetching} className="h-16 flex-col gap-2" variant="outline">
                                {isFetching && !isAiRewriting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Copy className="h-5 w-5" />}
                                <span>直接复制原文</span>
                            </Button>
                            <Button onClick={handleAiRewrite} disabled={isFetching || !hasApiKey()} className="h-16 flex-col gap-2" variant="outline">
                                {isAiRewriting ? <Loader2 className="h-5 w-5 animate-spin" /> : <WandSparkles className="h-5 w-5" />}
                                <span>AI仿写</span>
                            </Button>
                        </div>
                        <div className="border rounded-lg p-4 space-y-4">
                            <h3 className="font-semibold flex items-center gap-2"><Bot className="h-4 w-4" />AI仿写设置</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="rewrite-persona">AI 人设 / 系统指令</Label>
                                    <div className="flex items-center gap-2">
                                        <Select onValueChange={handleCommunityPromptSelect} disabled={isCommunityPromptsLoading}>
                                            <SelectTrigger className="w-[150px]"><SelectValue placeholder={<div className='flex items-center gap-2'><Users className="h-4 w-4"/>社区提示词</div>} /></SelectTrigger>
                                            <SelectContent>{isCommunityPromptsLoading ? <SelectItem value="loading" disabled>加载中...</SelectItem> : communityPrompts.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                                        </Select>
                                        <Button variant="outline" size="sm" onClick={() => persistRewritePersona(DEFAULT_REWRITE_PERSONA)}>重置默认</Button>
                                    </div>
                                    <Textarea id="rewrite-persona" rows={4} value={rewritePersona} onChange={(e) => persistRewritePersona(e.target.value)} placeholder="输入或粘贴AI人设" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="rewrite-prompt">仿写要求</Label>
                                    <Button variant="outline" size="sm" onClick={() => persistRewritePrompt(DEFAULT_REWRITE_PROMPT)}>重置默认</Button>
                                    <Textarea id="rewrite-prompt" rows={4} value={rewritePrompt} onChange={(e) => persistRewritePrompt(e.target.value)} placeholder="输入仿写要求" />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <Label htmlFor='model-select'>语言模型</Label>
                                    <Select value={selectedModel} onValueChange={setSelectedModel} disabled={isModelListLoading}>
                                        <SelectTrigger id='model-select'><SelectValue placeholder={isModelListLoading ? "加载中..." : "选择一个模型"} /></SelectTrigger>
                                        <SelectContent>{availableModels.map(model => <SelectItem key={model.id} value={model.id}>{model.displayName}</SelectItem>)}</SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground mt-1">{hasApiKey() ? <span className="text-green-600 dark:text-green-400">✓ 使用您的API密钥</span> : <span className="text-amber-600 dark:text-amber-400">⚠ 请先配置API密钥</span>}</p>
                                </div>
                                <div>
                                    <Label htmlFor='max-tokens-select'>最大输出长度</Label>
                                    <Select value={String(maxTokens)} onValueChange={(v) => { const n = parseInt(v, 10); setMaxTokens(n); persistSetting('chapter-rewrite-max-tokens', String(n)); }}>
                                        <SelectTrigger id='max-tokens-select'><SelectValue placeholder="选择最大输出长度" /></SelectTrigger>
                                        <SelectContent>{[1024, 2048, 4096, 6144, 8192].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground mt-1">较长章节建议使用更大的输出长度</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </ScrollArea>
                <DialogFooter>
                    <DialogClose asChild><Button variant="secondary" disabled={isFetching}>关闭</Button></DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
  );
}