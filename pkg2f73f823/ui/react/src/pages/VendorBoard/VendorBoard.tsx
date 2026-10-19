/*
 * Menu Board — the vendor rep's only workspace.
 *
 * A ServiceProvider (caterer) representative can see nothing else on the
 * platform: just the board where they publish their own business profile, their
 * menus, and per-person prices. Everything here is scoped to the vendor's own
 * ServiceProvider (via useActiveUser → activeServiceProviderId); they never see
 * other vendors, clubs, companies, or any other platform data.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ChefHat,
  Save,
  Plus,
  Pencil,
  Trash2,
  Store,
  Info,
} from 'lucide-react';

import { c3Action, c3CreateAction, c3MemberAction } from '@/c3Action';
import type { Menu, MenuItem, ServiceProvider } from '@/Interfaces';
import { useActiveUser } from '@/context/ActiveUser';
import { useErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary';
import { PageHeader } from '@/components/ui/page-header';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import {
  Alert,
  AlertAppearanceIcon,
  AlertContent,
  AlertTitle,
  AlertDescription,
} from '@/components/ui/alert';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalSubtitle,
  ModalBody,
  ModalFooter,
  ModalFooterActions,
} from '@/components/ui/modal';

interface ProfileForm {
  name: string;
  description: string;
  serviceArea: string;
  website: string;
  cuisines: string;
  priceLevel: string;
  minimumHeadcount: string;
}

interface ItemForm {
  id?: string;
  menuId: string;
  name: string;
  description: string;
  category: string;
  pricePerPerson: string;
  minimumOrder: string;
  dietaryTags: string;
}

const EMPTY_ITEM_FORM: ItemForm = {
  menuId: '',
  name: '',
  description: '',
  category: '',
  pricePerPerson: '',
  minimumOrder: '',
  dietaryTags: '',
};

function toList(csv: string): string[] {
  return csv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function money(n?: number): string {
  if (typeof n !== 'number') return '—';
  return `$${n.toFixed(2)}`;
}

const VendorBoard: React.FC = () => {
  const { activeServiceProviderId, activeUser } = useActiveUser();
  const { reportError } = useErrorBoundary();

  const [provider, setProvider] = useState<ServiceProvider | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profile, setProfile] = useState<ProfileForm | null>(null);

  // Menu-item editor modal
  const [itemForm, setItemForm] = useState<ItemForm | null>(null);
  const [savingItem, setSavingItem] = useState(false);

  // New-menu modal
  const [newMenu, setNewMenu] = useState<{ name: string; description: string } | null>(null);
  const [savingMenu, setSavingMenu] = useState(false);

  const loadProvider = useCallback(async () => {
    if (!activeServiceProviderId) {
      setProvider(null);
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const resp = await c3Action('ServiceProvider', 'fetch', {
        filter: `id == '${activeServiceProviderId}'`,
        include:
          'this, name, description, serviceArea, website, cuisines, priceLevel, minimumHeadcount, rating, ' +
          'menus.this, menus.name, menus.description, ' +
          'menus.items.this, menus.items.name, menus.items.description, menus.items.category, ' +
          'menus.items.pricePerPerson, menus.items.minimumOrder, menus.items.dietaryTags',
        limit: 1,
      });
      const sp = (resp?.objs ?? [])[0] as ServiceProvider | undefined;
      setProvider(sp ?? null);
      if (sp) {
        setProfile({
          name: sp.name ?? '',
          description: sp.description ?? '',
          serviceArea: sp.serviceArea ?? '',
          website: sp.website ?? '',
          cuisines: (sp.cuisines ?? []).join(', '),
          priceLevel: sp.priceLevel != null ? String(sp.priceLevel) : '',
          minimumHeadcount: sp.minimumHeadcount != null ? String(sp.minimumHeadcount) : '',
        });
      }
    } catch (e) {
      setError('Failed to load your vendor profile.');
      reportError(e);
    } finally {
      setLoading(false);
    }
  }, [activeServiceProviderId, reportError]);

  useEffect(() => {
    loadProvider();
  }, [loadProvider]);

  const handleSaveProfile = useCallback(async () => {
    if (!provider || !profile) return;
    setSavingProfile(true);
    setError(null);
    try {
      await c3CreateAction('ServiceProvider', 'upsert', {
        id: provider.id,
        name: profile.name.trim(),
        description: profile.description.trim(),
        serviceArea: profile.serviceArea.trim(),
        website: profile.website.trim(),
        cuisines: toList(profile.cuisines),
        priceLevel: profile.priceLevel ? Number(profile.priceLevel) : undefined,
        minimumHeadcount: profile.minimumHeadcount ? Number(profile.minimumHeadcount) : undefined,
      });
      await loadProvider();
    } catch (e) {
      setError('Failed to save your profile.');
      reportError(e);
    } finally {
      setSavingProfile(false);
    }
  }, [provider, profile, loadProvider, reportError]);

  const openNewItem = useCallback((menuId: string) => {
    setItemForm({ ...EMPTY_ITEM_FORM, menuId });
  }, []);

  const openEditItem = useCallback((menuId: string, item: MenuItem) => {
    setItemForm({
      id: item.id,
      menuId,
      name: item.name ?? '',
      description: item.description ?? '',
      category: item.category ?? '',
      pricePerPerson: item.pricePerPerson != null ? String(item.pricePerPerson) : '',
      minimumOrder: item.minimumOrder != null ? String(item.minimumOrder) : '',
      dietaryTags: (item.dietaryTags ?? []).join(', '),
    });
  }, []);

  const handleSaveItem = useCallback(async () => {
    if (!itemForm) return;
    setSavingItem(true);
    setError(null);
    try {
      const id =
        itemForm.id ??
        `mi_${itemForm.menuId}_${Date.now().toString(36)}`;
      await c3CreateAction('MenuItem', 'upsert', {
        id,
        menu: { id: itemForm.menuId },
        name: itemForm.name.trim(),
        description: itemForm.description.trim(),
        category: itemForm.category.trim(),
        pricePerPerson: itemForm.pricePerPerson ? Number(itemForm.pricePerPerson) : undefined,
        minimumOrder: itemForm.minimumOrder ? Number(itemForm.minimumOrder) : undefined,
        dietaryTags: toList(itemForm.dietaryTags),
      });
      setItemForm(null);
      await loadProvider();
    } catch (e) {
      setError('Failed to save the menu item.');
      reportError(e);
    } finally {
      setSavingItem(false);
    }
  }, [itemForm, loadProvider, reportError]);

  const handleDeleteItem = useCallback(
    async (item: MenuItem) => {
      setError(null);
      try {
        await c3MemberAction('MenuItem', 'remove', { id: item.id });
        await loadProvider();
      } catch (e) {
        setError('Failed to delete the menu item.');
        reportError(e);
      }
    },
    [loadProvider, reportError],
  );

  const handleCreateMenu = useCallback(async () => {
    if (!newMenu || !provider) return;
    setSavingMenu(true);
    setError(null);
    try {
      await c3CreateAction('Menu', 'upsert', {
        id: `menu_${provider.id}_${Date.now().toString(36)}`,
        serviceProvider: { id: provider.id },
        name: newMenu.name.trim(),
        description: newMenu.description.trim(),
      });
      setNewMenu(null);
      await loadProvider();
    } catch (e) {
      setError('Failed to create the menu.');
      reportError(e);
    } finally {
      setSavingMenu(false);
    }
  }, [newMenu, provider, loadProvider, reportError]);

  // --- Render ---------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex min-h-full w-full items-center justify-center gap-[var(--c3-style-spacing-8)] p-[var(--c3-style-spacing-24)] text-[var(--c3-style-basic-fg-secondary)]">
        <Spinner size="lg" />
        <span className="text-c3-regular-body-p2">Loading your menu board…</span>
      </div>
    );
  }

  if (!activeServiceProviderId || !provider) {
    return (
      <div className="flex min-h-full w-full flex-col">
        <PageHeader
          title="Menu Board"
          description="Publish your menu, prices, and vital info."
        />
        <div className="p-[var(--c3-style-spacing-24)]">
          <Alert variant="soft" appearance="info">
            <AlertAppearanceIcon appearance="info" />
            <AlertContent>
              <AlertTitle>No vendor in scope</AlertTitle>
              <AlertDescription>
                You are acting as {activeUser?.name ?? 'a platform user'}. The Menu Board is scoped
                to a specific vendor — switch to a Vendor Rep persona to manage a menu board.
              </AlertDescription>
            </AlertContent>
          </Alert>
        </div>
      </div>
    );
  }

  const menus: Menu[] = provider.menus ?? [];

  return (
    <div className="flex min-h-full w-full flex-col">
      <PageHeader
        title="Menu Board"
        description="Publish your menu, prices, and vital info — clubs booking events see exactly this."
        badges={
          <Badge appearance="accent" variant="soft" leadingIcon={<Store />}>
            {provider.name}
          </Badge>
        }
        actions={
          <Button
            appearance="accent"
            leadingIcon={<Plus />}
            onClick={() => setNewMenu({ name: '', description: '' })}
          >
            Add menu
          </Button>
        }
      />

      <div className="flex flex-col gap-[var(--c3-style-spacing-24)] p-[var(--c3-style-spacing-24)]">
        {error ? (
          <Alert variant="soft" appearance="destructive">
            <AlertAppearanceIcon appearance="destructive" />
            <AlertContent>
              <AlertTitle>Something went wrong</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}

        {/* Business profile / vital info */}
        {profile ? (
          <Card variant="elevated">
            <CardHeader>
              <CardTitle className="flex items-center gap-[var(--c3-style-spacing-8)]">
                <ChefHat className="size-5" aria-hidden />
                Business profile
              </CardTitle>
              <CardDescription>
                The vital info clubs see first — keep it accurate.
                {typeof provider.rating === 'number'
                  ? ` Current rating: ${provider.rating.toFixed(1)}★`
                  : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-[var(--c3-style-spacing-16)] md:grid-cols-2">
              <Field label="Business name" htmlFor="vp-name">
                <Input
                  id="vp-name"
                  value={profile.name}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                />
              </Field>
              <Field label="Service area" htmlFor="vp-area">
                <Input
                  id="vp-area"
                  value={profile.serviceArea}
                  placeholder="e.g. Madison, WI"
                  onChange={(e) => setProfile({ ...profile, serviceArea: e.target.value })}
                />
              </Field>
              <Field label="Website" htmlFor="vp-web">
                <Input
                  id="vp-web"
                  value={profile.website}
                  placeholder="https://…"
                  onChange={(e) => setProfile({ ...profile, website: e.target.value })}
                />
              </Field>
              <Field label="Cuisines (comma-separated)" htmlFor="vp-cuisines">
                <Input
                  id="vp-cuisines"
                  value={profile.cuisines}
                  placeholder="Pizza, Italian, Vegetarian"
                  onChange={(e) => setProfile({ ...profile, cuisines: e.target.value })}
                />
              </Field>
              <Field label="Price level (1–4)" htmlFor="vp-price">
                <Input
                  id="vp-price"
                  type="number"
                  min={1}
                  max={4}
                  value={profile.priceLevel}
                  onChange={(e) => setProfile({ ...profile, priceLevel: e.target.value })}
                />
              </Field>
              <Field label="Minimum headcount" htmlFor="vp-min">
                <Input
                  id="vp-min"
                  type="number"
                  min={0}
                  value={profile.minimumHeadcount}
                  onChange={(e) => setProfile({ ...profile, minimumHeadcount: e.target.value })}
                />
              </Field>
              <div className="md:col-span-2">
                <Field label="Description" htmlFor="vp-desc">
                  <Textarea
                    id="vp-desc"
                    rows={3}
                    value={profile.description}
                    placeholder="What you offer, what makes you a good fit for student events…"
                    onChange={(e) => setProfile({ ...profile, description: e.target.value })}
                  />
                </Field>
              </div>
            </CardContent>
            <CardFooter bordered className="justify-end">
              <Button
                appearance="accent"
                leadingIcon={<Save />}
                loading={savingProfile}
                disabled={profile.name.trim().length === 0}
                onClick={handleSaveProfile}
              >
                Save profile
              </Button>
            </CardFooter>
          </Card>
        ) : null}

        {/* Menus */}
        {menus.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-[var(--c3-style-spacing-8)] rounded-[var(--c3-style-border-radius-6)] border border-dashed border-[var(--c3-style-basic-border-border)] py-16 text-center">
            <Info className="size-6 text-[var(--c3-style-basic-fg-secondary)]" aria-hidden />
            <p className="text-c3-bold-body-p2 text-[var(--c3-style-basic-fg-primary)]">
              No menus yet
            </p>
            <p className="max-w-[420px] text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
              Add a menu to start publishing packages and per-person prices.
            </p>
          </div>
        ) : null}

        {menus.map((menu) => {
          const items = menu.items ?? [];
          return (
            <Card key={menu.id} variant="elevated">
              <CardHeader>
                <CardTitle>{menu.name}</CardTitle>
                {menu.description ? <CardDescription>{menu.description}</CardDescription> : null}
                <CardAction>
                  <Button
                    variant="outline"
                    appearance="secondary"
                    leadingIcon={<Plus />}
                    onClick={() => openNewItem(menu.id)}
                  >
                    Add item
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-[var(--c3-style-spacing-8)]">
                {items.length === 0 ? (
                  <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-neutral)]">
                    No items on this menu yet.
                  </p>
                ) : (
                  items.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-[var(--c3-style-spacing-6)] rounded-[var(--c3-style-border-radius-4)] bg-[var(--c3-style-basic-bg-secondary)] p-[var(--c3-style-spacing-12)] md:flex-row md:items-start md:justify-between"
                    >
                      <div className="flex flex-col gap-[var(--c3-style-spacing-4)]">
                        <div className="flex flex-wrap items-center gap-[var(--c3-style-spacing-8)]">
                          <span className="text-c3-bold-body-p3 text-[var(--c3-style-basic-fg-primary)]">
                            {item.name}
                          </span>
                          {item.category ? (
                            <Badge variant="outline" appearance="secondary">
                              {item.category}
                            </Badge>
                          ) : null}
                          {(item.dietaryTags ?? []).map((t) => (
                            <Badge key={t} variant="soft" appearance="success">
                              {t}
                            </Badge>
                          ))}
                        </div>
                        {item.description ? (
                          <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
                            {item.description}
                          </p>
                        ) : null}
                        <span className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
                          {money(item.pricePerPerson)} / person
                          {typeof item.minimumOrder === 'number'
                            ? ` · min ${item.minimumOrder}`
                            : ''}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-[var(--c3-style-spacing-8)]">
                        <Button
                          variant="ghost"
                          appearance="secondary"
                          size="icon-sm"
                          aria-label={`Edit ${item.name}`}
                          onClick={() => openEditItem(menu.id, item)}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          appearance="danger"
                          size="icon-sm"
                          aria-label={`Delete ${item.name}`}
                          onClick={() => handleDeleteItem(item)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Menu-item editor modal */}
      <Modal open={itemForm !== null} onOpenChange={(o) => (!o ? setItemForm(null) : null)}>
        <ModalContent width={560}>
          <ModalHeader>
            <ModalTitle>{itemForm?.id ? 'Edit item' : 'Add item'}</ModalTitle>
            <ModalSubtitle>Set the item details and per-person price.</ModalSubtitle>
          </ModalHeader>
          <ModalBody>
            {itemForm ? (
              <div className="flex flex-col gap-[var(--c3-style-spacing-12)]">
                <Field label="Name" htmlFor="it-name">
                  <Input
                    id="it-name"
                    value={itemForm.name}
                    onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                  />
                </Field>
                <Field label="Description" htmlFor="it-desc">
                  <Textarea
                    id="it-desc"
                    rows={2}
                    value={itemForm.description}
                    onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                  />
                </Field>
                <div className="grid grid-cols-1 gap-[var(--c3-style-spacing-12)] md:grid-cols-2">
                  <Field label="Category" htmlFor="it-cat">
                    <Input
                      id="it-cat"
                      value={itemForm.category}
                      placeholder="e.g. Package, Entree"
                      onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })}
                    />
                  </Field>
                  <Field label="Dietary tags (comma-separated)" htmlFor="it-diet">
                    <Input
                      id="it-diet"
                      value={itemForm.dietaryTags}
                      placeholder="Vegan, Halal"
                      onChange={(e) => setItemForm({ ...itemForm, dietaryTags: e.target.value })}
                    />
                  </Field>
                  <Field label="Price per person ($)" htmlFor="it-price">
                    <Input
                      id="it-price"
                      type="number"
                      min={0}
                      step={0.5}
                      value={itemForm.pricePerPerson}
                      onChange={(e) =>
                        setItemForm({ ...itemForm, pricePerPerson: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Minimum order (people)" htmlFor="it-min">
                    <Input
                      id="it-min"
                      type="number"
                      min={0}
                      value={itemForm.minimumOrder}
                      onChange={(e) => setItemForm({ ...itemForm, minimumOrder: e.target.value })}
                    />
                  </Field>
                </div>
              </div>
            ) : null}
          </ModalBody>
          <ModalFooter>
            <ModalFooterActions>
              <Button
                variant="outline"
                appearance="secondary"
                onClick={() => setItemForm(null)}
                disabled={savingItem}
              >
                Cancel
              </Button>
              <Button
                appearance="accent"
                leadingIcon={<Save />}
                loading={savingItem}
                disabled={!itemForm || itemForm.name.trim().length === 0}
                onClick={handleSaveItem}
              >
                Save item
              </Button>
            </ModalFooterActions>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* New-menu modal */}
      <Modal open={newMenu !== null} onOpenChange={(o) => (!o ? setNewMenu(null) : null)}>
        <ModalContent width={480}>
          <ModalHeader>
            <ModalTitle>Add menu</ModalTitle>
            <ModalSubtitle>Create a new menu or package to list items under.</ModalSubtitle>
          </ModalHeader>
          <ModalBody>
            {newMenu ? (
              <div className="flex flex-col gap-[var(--c3-style-spacing-12)]">
                <Field label="Menu name" htmlFor="mn-name">
                  <Input
                    id="mn-name"
                    value={newMenu.name}
                    placeholder="e.g. Group Pizza Package"
                    onChange={(e) => setNewMenu({ ...newMenu, name: e.target.value })}
                  />
                </Field>
                <Field label="Description" htmlFor="mn-desc">
                  <Textarea
                    id="mn-desc"
                    rows={2}
                    value={newMenu.description}
                    onChange={(e) => setNewMenu({ ...newMenu, description: e.target.value })}
                  />
                </Field>
              </div>
            ) : null}
          </ModalBody>
          <ModalFooter>
            <ModalFooterActions>
              <Button
                variant="outline"
                appearance="secondary"
                onClick={() => setNewMenu(null)}
                disabled={savingMenu}
              >
                Cancel
              </Button>
              <Button
                appearance="accent"
                leadingIcon={<Save />}
                loading={savingMenu}
                disabled={!newMenu || newMenu.name.trim().length === 0}
                onClick={handleCreateMenu}
              >
                Create menu
              </Button>
            </ModalFooterActions>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
};

/** Small labeled-field wrapper used throughout the board forms. */
function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-[var(--c3-style-spacing-6)]">
      <label
        htmlFor={htmlFor}
        className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-primary)]"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

export default VendorBoard;
