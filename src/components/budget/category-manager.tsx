"use client";

import { useMemo, useState } from "react";
import { GripVertical, Plus, Sprout, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useCategories } from "@/hooks/use-categories";
import type { Id } from "convex/_generated/dataModel";

type Tier = "income" | "fixed" | "flexible" | "savings";

const TIER_LABEL: Record<Tier, string> = {
  income: "Income",
  fixed: "Fixed",
  flexible: "Flexible",
  savings: "Savings",
};

export function CategoryManager() {
  const {
    allGroups,
    categories,
    createGroup,
    updateGroup,
    removeGroup,
    createCategory,
    updateCategory,
    removeCategory,
    seedFromTransactions,
    reorderGroups,
    reorderCategories,
  } = useCategories();
  const [groupName, setGroupName] = useState("");
  const [groupIcon, setGroupIcon] = useState("");
  const [tier, setTier] = useState<Tier>("flexible");
  const [categoryName, setCategoryName] = useState("");
  const [categoryIcon, setCategoryIcon] = useState("");
  const [categoryGroupId, setCategoryGroupId] = useState<string>("");
  const [dragGroupId, setDragGroupId] = useState<Id<"categoryGroups"> | null>(
    null,
  );
  const [dragCategoryId, setDragCategoryId] =
    useState<Id<"categories"> | null>(null);

  const groups = allGroups;
  const categoriesByGroup = useMemo(() => {
    const map = new Map<Id<"categoryGroups">, NonNullable<typeof categories>>();
    for (const category of categories ?? []) {
      const rows = map.get(category.groupId) ?? [];
      rows.push(category);
      map.set(category.groupId, rows);
    }
    for (const rows of map.values()) {
      rows.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return map;
  }, [categories]);

  const createNewGroup = async () => {
    const name = groupName.trim();
    if (!name) return;
    await createGroup({
      name,
      waterfallTier: tier,
      icon: groupIcon.trim() || undefined,
    });
    setGroupName("");
    setGroupIcon("");
  };

  const createNewCategory = async () => {
    const name = categoryName.trim();
    if (!name || !categoryGroupId) return;
    await createCategory({
      name,
      groupId: categoryGroupId as Id<"categoryGroups">,
      icon: categoryIcon.trim() || undefined,
    });
    setCategoryName("");
    setCategoryIcon("");
  };

  if (!groups || !categories) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Category manager</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  const moveGroup = async (
    sourceId: Id<"categoryGroups">,
    targetId: Id<"categoryGroups">,
  ) => {
    const ordered = [...groups];
    const from = ordered.findIndex((g) => g._id === sourceId);
    const to = ordered.findIndex((g) => g._id === targetId);
    if (from < 0 || to < 0 || from === to) return;
    const [item] = ordered.splice(from, 1);
    ordered.splice(to, 0, item);
    await reorderGroups({ orderedGroupIds: ordered.map((g) => g._id) });
  };

  const moveCategory = async (
    groupId: Id<"categoryGroups">,
    sourceId: Id<"categories">,
    targetId: Id<"categories">,
  ) => {
    const ordered = [...(categoriesByGroup.get(groupId) ?? [])];
    const from = ordered.findIndex((c) => c._id === sourceId);
    const to = ordered.findIndex((c) => c._id === targetId);
    if (from < 0 || to < 0 || from === to) return;
    const [item] = ordered.splice(from, 1);
    ordered.splice(to, 0, item);
    await reorderCategories({
      groupId,
      orderedCategoryIds: ordered.map((c) => c._id),
    });
  };

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">Category manager</CardTitle>
        <p className="text-xs text-muted-foreground">
          Create category groups, assign waterfall tiers, seed from transactions,
          and drag rows to reorder.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void seedFromTransactions({})}
          >
            <Sprout className="mr-1 h-4 w-4" />
            Auto-populate from transactions
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="space-y-3 rounded-lg border p-3">
            <h3 className="text-sm font-medium">New group</h3>
            <div className="grid gap-2 sm:grid-cols-[1fr_7rem]">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Flexible Spending"
                />
              </div>
              <div className="space-y-1">
                <Label>Icon</Label>
                <Input
                  value={groupIcon}
                  onChange={(e) => setGroupIcon(e.target.value)}
                  placeholder="Wallet"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Waterfall tier</Label>
              <Select value={tier} onValueChange={(v) => setTier(v as Tier)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TIER_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="button" onClick={() => void createNewGroup()}>
              <Plus className="mr-1 h-4 w-4" />
              Add group
            </Button>
          </section>

          <section className="space-y-3 rounded-lg border p-3">
            <h3 className="text-sm font-medium">New category</h3>
            <div className="grid gap-2 sm:grid-cols-[1fr_7rem]">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  placeholder="Groceries"
                />
              </div>
              <div className="space-y-1">
                <Label>Icon</Label>
                <Input
                  value={categoryIcon}
                  onChange={(e) => setCategoryIcon(e.target.value)}
                  placeholder="ShoppingCart"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Group</Label>
              <Select value={categoryGroupId} onValueChange={setCategoryGroupId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a group" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((group) => (
                    <SelectItem key={group._id} value={group._id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              disabled={!categoryGroupId}
              onClick={() => void createNewCategory()}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add category
            </Button>
          </section>
        </div>

        <Separator />

        <div className="space-y-3">
          {groups.map((group) => {
            const childRows = categoriesByGroup.get(group._id) ?? [];
            return (
              <section
                key={group._id}
                className="rounded-lg border p-3"
                draggable
                onDragStart={() => setDragGroupId(group._id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragGroupId) void moveGroup(dragGroupId, group._id);
                  setDragGroupId(null);
                }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <Input
                    className="min-w-40 flex-1"
                    value={group.name}
                    onChange={(e) =>
                      void updateGroup({
                        groupId: group._id,
                        name: e.target.value,
                      })
                    }
                  />
                  <Input
                    className="w-28"
                    placeholder="Icon"
                    value={group.icon ?? ""}
                    onChange={(e) =>
                      void updateGroup({
                        groupId: group._id,
                        icon: e.target.value,
                      })
                    }
                  />
                  <Select
                    value={group.waterfallTier}
                    onValueChange={(v) =>
                      void updateGroup({
                        groupId: group._id,
                        waterfallTier: v as Tier,
                      })
                    }
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TIER_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={group.isSystem}
                    onClick={() => void removeGroup({ groupId: group._id })}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Delete group</span>
                  </Button>
                </div>

                <div className="mt-3 space-y-2 pl-6">
                  {childRows.map((category) => (
                    <div
                      key={category._id}
                      className="flex flex-wrap items-center gap-2 rounded-md bg-muted/30 p-2"
                      draggable
                      onDragStart={() => setDragCategoryId(category._id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (dragCategoryId) {
                          void moveCategory(
                            group._id,
                            dragCategoryId,
                            category._id,
                          );
                        }
                        setDragCategoryId(null);
                      }}
                    >
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <Input
                        className="min-w-36 flex-1"
                        value={category.name}
                        onChange={(e) =>
                          void updateCategory({
                            categoryId: category._id,
                            name: e.target.value,
                          })
                        }
                      />
                      <Input
                        className="w-28"
                        placeholder="Icon"
                        value={category.icon ?? ""}
                        onChange={(e) =>
                          void updateCategory({
                            categoryId: category._id,
                            icon: e.target.value,
                          })
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={category.isSystem}
                        onClick={() =>
                          void removeCategory({ categoryId: category._id })
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Delete category</span>
                      </Button>
                    </div>
                  ))}
                  {childRows.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No categories in this group yet.
                    </p>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
