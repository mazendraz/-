import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack, useLocalSearchParams } from "expo-router";
import type { ApiCompany } from "@alassema/core";
import { ApiError, textStart } from "@alassema/mobile-shared";
import { colors, type } from "@alassema/core";
import { fetchUsers, createUser, updateUser, deleteUser } from "../../lib/adminTeam";
import { fetchAdminCompanies } from "../../lib/adminCompanies";
import { useStaffAuth } from "../../lib/staffAuth";
import Button from "../../components/Button";
import RoleSelector from "../../components/RoleSelector";
import PermissionChecklist from "../../components/PermissionChecklist";
import DangerConfirm from "../../components/DangerConfirm";
import { ListSkeleton, ErrorCard } from "../../components/ListStates";

export default function UserEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";
  const { user: me } = useStaffAuth();
  const isSelf = !isNew && me?.id === id;

  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "PROVIDER">("PROVIDER");
  const [isActive, setIsActive] = useState(true);
  const [desktopPermissions, setDesktopPermissions] = useState<string[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);

  const [companyQuery, setCompanyQuery] = useState("");
  const [companyResults, setCompanyResults] = useState<ApiCompany[]>([]);

  const [dangerAction, setDangerAction] = useState<"deactivate" | "delete" | null>(null);

  const load = useCallback(async () => {
    if (isNew || !id) return;
    setError(null);
    try {
      const page = await fetchUsers({ pageSize: 100 });
      const found = page.data.find((u) => u.id === id);
      if (!found) throw new ApiError(404, "العضو مش لاقيه.");
      setName(found.name);
      setEmail(found.email);
      setRole(found.role);
      setIsActive(found.isActive);
      setDesktopPermissions(found.desktopPermissions);
      setCompanyId(found.companyId);
      setCompanyName(found.companyName);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل العضو. جرّب تاني.");
    } finally {
      setLoading(false);
    }
  }, [id, isNew]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!companyQuery.trim()) {
      setCompanyResults([]);
      return;
    }
    const timer = setTimeout(() => {
      fetchAdminCompanies({ search: companyQuery.trim(), pageSize: 6 })
        .then((res) => setCompanyResults(res.data))
        .catch(() => setCompanyResults([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [companyQuery]);

  const canSave = isNew
    ? name.trim().length >= 2 && email.trim().length > 0 && password.trim().length >= 8
    : name.trim().length >= 2;

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      if (isNew) {
        const created = await createUser({
          name: name.trim(), email: email.trim(), password: password.trim(),
          role, companyId: role === "PROVIDER" ? companyId : null,
        });
        router.replace(`/team/${created.id}`);
      } else if (id) {
        await updateUser(id, {
          name: name.trim(),
          password: password.trim() || undefined,
          role,
          companyId: role === "PROVIDER" ? companyId : null,
          desktopPermissions,
        });
        setPassword("");
        Alert.alert("تم الحفظ", "اتحفظت بيانات العضو.");
      }
    } catch (err) {
      Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر الحفظ. جرّب تاني.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive() {
    if (!id) return;
    if (isActive && isSelf) {
      Alert.alert("مينفعش", "متقدرش تعطّل حسابك بنفسك — هتتسجّل خروج فورًا. اطلب من أدمن تاني.");
      return;
    }
    if (isActive) {
      setDangerAction("deactivate");
      return;
    }
    // Re-activating needs no hard confirm — it only restores access.
    setSaving(true);
    try {
      const updated = await updateUser(id, { isActive: true });
      setIsActive(updated.isActive);
    } catch (err) {
      Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر التحديث.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeactivate() {
    if (!id) return;
    setSaving(true);
    try {
      const updated = await updateUser(id, { isActive: false });
      setIsActive(updated.isActive);
      setDangerAction(null);
    } catch (err) {
      Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر التعطيل.");
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (isSelf) {
      Alert.alert("مينفعش", "متقدرش تحذف حسابك بنفسك. اطلب من أدمن تاني.");
      return;
    }
    setDangerAction("delete");
  }

  async function confirmDelete() {
    if (!id) return;
    setDeleting(true);
    try {
      await deleteUser(id);
      router.back();
    } catch (err) {
      Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر الحذف.");
      setDeleting(false);
      setDangerAction(null);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: isNew ? "عضو جديد" : name || "تعديل العضو" }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        {loading ? (
          <ListSkeleton rows={3} />
        ) : error ? (
          <ErrorCard message={error} onRetry={load} />
        ) : (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View>
              <Text style={styles.label}>الاسم</Text>
              <TextInput style={styles.input} value={name} onChangeText={setName} placeholderTextColor={colors.onSurfaceVariant} />
            </View>

            {isNew ? (
              <View>
                <Text style={styles.label}>البريد الإلكتروني</Text>
                <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholderTextColor={colors.onSurfaceVariant} />
              </View>
            ) : (
              <View>
                <Text style={styles.label}>البريد الإلكتروني</Text>
                <Text style={styles.readonlyValue}>{email}</Text>
              </View>
            )}

            <View>
              <Text style={styles.label}>{isNew ? "كلمة السر" : "إعادة تعيين كلمة السر (اختياري)"}</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder={isNew ? "8 أحرف على الأقل" : "سيبها فاضية لو مش هتغيّرها"}
                placeholderTextColor={colors.onSurfaceVariant}
              />
            </View>

            <View>
              <Text style={styles.label}>الدور</Text>
              <RoleSelector value={role} onChange={setRole} />
            </View>

            {role === "PROVIDER" ? (
              <View>
                <Text style={styles.label}>الشركة</Text>
                {companyId && companyName ? (
                  <Pressable style={styles.companyChip} onPress={() => { setCompanyId(null); setCompanyName(null); }}>
                    <Text style={styles.companyChipText}>{companyName} ✕</Text>
                  </Pressable>
                ) : (
                  <>
                    <TextInput
                      style={styles.input}
                      value={companyQuery}
                      onChangeText={setCompanyQuery}
                      placeholder="ابحث عن شركة لربطها"
                      placeholderTextColor={colors.onSurfaceVariant}
                    />
                    {companyResults.map((c) => (
                      <Pressable
                        key={c.id}
                        style={styles.companyResultRow}
                        onPress={() => { setCompanyId(c.id); setCompanyName(c.name); setCompanyQuery(""); setCompanyResults([]); }}
                      >
                        <Text style={styles.companyResultText}>{c.name}</Text>
                      </Pressable>
                    ))}
                  </>
                )}
              </View>
            ) : null}

            {!isNew ? (
              <View>
                <Text style={styles.label}>صلاحيات لوحة التحكم المكتبية</Text>
                <PermissionChecklist value={desktopPermissions} onChange={setDesktopPermissions} />
              </View>
            ) : null}

            <Button label={saving ? "بيتحفظ..." : isNew ? "إنشاء الحساب" : "حفظ التعديلات"} onPress={handleSave} busy={saving} disabled={!canSave} />

            {!isNew ? (
              <>
                <Button
                  label={isActive ? "تعطيل الحساب" : "تفعيل الحساب"}
                  variant={isActive ? "danger" : "secondary"}
                  onPress={handleToggleActive}
                  busy={saving}
                />
                <Button label="حذف الحساب" variant="danger" onPress={handleDelete} style={styles.deleteBtn} />
              </>
            ) : null}
          </ScrollView>
        )}

        <DangerConfirm
          visible={dangerAction === "deactivate"}
          title="تعطيل الحساب"
          consequence={`هيتقفل كل جلسات "${name}" فورًا — الويب والموبايل ولوحة التحكم المكتبية. تقدر تفعّله تاني في أي وقت.`}
          confirmPhrase="تعطيل"
          confirmLabel="تعطيل الحساب"
          busy={saving}
          onConfirm={confirmDeactivate}
          onClose={() => setDangerAction(null)}
        />
        <DangerConfirm
          visible={dangerAction === "delete"}
          title="حذف الحساب"
          consequence={`هل تريد حذف حساب "${name}" نهائيًا؟ لا يمكن التراجع.`}
          confirmPhrase="حذف"
          confirmLabel="حذف الحساب"
          busy={deleting}
          onConfirm={confirmDelete}
          onClose={() => setDangerAction(null)}
        />
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  label: { fontSize: type.label.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSurfaceVariant, marginBottom: 6, textAlign: textStart },
  readonlyValue: { fontSize: type.body.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: textStart },
  input: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: type.body.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.onSurface,
    backgroundColor: colors.surface,
    textAlign: textStart,
  },
  companyChip: { alignSelf: "flex-start", backgroundColor: colors.primaryContainer, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  companyChipText: { fontSize: type.caption.fontSize, fontFamily: "Cairo_700Bold", color: colors.onPrimaryContainer },
  companyResultRow: { paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: 10, marginTop: 6 },
  companyResultText: { fontSize: type.label.fontSize, fontFamily: "Cairo_500Medium", color: colors.onSurface, textAlign: textStart },
  deleteBtn: { marginTop: 4 },
});
